import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../prisma";

// Both hit the live Sorare/Google News APIs for real — mocked so the test is
// deterministic and never spams a third-party service (see alerts.ts's own
// comment on why the news half must stay a bounded, paced job in the first place).
// Only searchPlayerNews itself is mocked — EN_LOCALE/FR_LOCALE stay real
// since alerts.ts imports and passes them as plain values.
vi.mock("./market", () => ({ getPlayerMarket: vi.fn() }));
vi.mock("./news", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./news")>()),
  searchPlayerNews: vi.fn(),
}));

import { getPlayerMarket } from "./market";
import { searchPlayerNews } from "./news";
import { runAlerts, getAlertsBySlug } from "./alerts";

async function cleanDb() {
  await prisma.priceSnapshot.deleteMany();
  await prisma.playerAlert.deleteMany();
  await prisma.watchlistItem.deleteMany();
  await prisma.watchlistGroup.deleteMany();
  await prisma.card.deleteMany();
  await prisma.player.deleteMany();
}

describe("runAlerts", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.mocked(getPlayerMarket).mockReset();
    vi.mocked(searchPlayerNews).mockReset().mockResolvedValue([]);
  });
  afterAll(cleanDb);

  async function trackViaCard(playerSlug: string, name: string, rarity = "limited") {
    await prisma.player.create({ data: { slug: playerSlug, displayName: name, position: "Forward" } });
    await prisma.card.create({ data: { slug: `${playerSlug}-2024-${rarity}-1`, playerSlug, rarity } });
  }

  it("creates no alert on the first check — nothing to compare against yet", async () => {
    await trackViaCard("player-a", "Player A");
    vi.mocked(getPlayerMarket).mockResolvedValue({
      slug: "player-a",
      name: "Player A",
      floorByRarity: { limited: 100 },
    floorInSeasonByRarity: { limited: 100 },
      listedCount: 1,
    });

    await runAlerts(10_000);

    const alerts = await getAlertsBySlug();
    expect(alerts.get("player-a")).toBeUndefined();
    const snapshots = await prisma.priceSnapshot.findMany({ where: { playerSlug: "player-a" } });
    expect(snapshots).toHaveLength(1);
  });

  it("flags price_down after a >=10% drop between two runs", async () => {
    await trackViaCard("player-b", "Player B");
    vi.mocked(getPlayerMarket)
      .mockResolvedValueOnce({ slug: "player-b", name: "Player B", floorByRarity: { limited: 100 }, floorInSeasonByRarity: { limited: 100 }, listedCount: 1 })
      .mockResolvedValueOnce({ slug: "player-b", name: "Player B", floorByRarity: { limited: 80 }, floorInSeasonByRarity: { limited: 80 }, listedCount: 1 });

    await runAlerts(10_000);
    await runAlerts(10_000);

    const alerts = await getAlertsBySlug();
    const rows = alerts.get("player-b") ?? [];
    expect(rows.find((a) => a.kind === "price_down")).toBeTruthy();
    expect(rows.find((a) => a.kind === "price_up")).toBeUndefined();
  });

  it("clears a stale alert once the price recovers", async () => {
    await trackViaCard("player-c", "Player C");
    vi.mocked(getPlayerMarket)
      .mockResolvedValueOnce({ slug: "player-c", name: "Player C", floorByRarity: { limited: 100 }, floorInSeasonByRarity: { limited: 100 }, listedCount: 1 })
      .mockResolvedValueOnce({ slug: "player-c", name: "Player C", floorByRarity: { limited: 80 }, floorInSeasonByRarity: { limited: 80 }, listedCount: 1 })
      .mockResolvedValueOnce({ slug: "player-c", name: "Player C", floorByRarity: { limited: 82 }, floorInSeasonByRarity: { limited: 82 }, listedCount: 1 });

    await runAlerts(10_000); // baseline
    await runAlerts(10_000); // drop -> price_down
    let alerts = await getAlertsBySlug();
    expect(alerts.get("player-c")?.some((a) => a.kind === "price_down")).toBe(true);

    await runAlerts(10_000); // small recovery, within threshold of the *previous* snapshot -> cleared
    alerts = await getAlertsBySlug();
    // No entry at all is the correct outcome once every alert for this player
    // has been cleared — getAlertsBySlug only carries players with >=1 alert.
    expect((alerts.get("player-c") ?? []).some((a) => a.kind === "price_down")).toBe(false);
  });

  it("flags a transfer alert, staged, when a tracked player's news matches transfer vocabulary", async () => {
    await trackViaCard("player-d", "Player D");
    vi.mocked(getPlayerMarket).mockResolvedValue({
      slug: "player-d",
      name: "Player D",
      floorByRarity: {}, floorInSeasonByRarity: {},
      listedCount: 0,
    });
    vi.mocked(searchPlayerNews).mockResolvedValue([
      { title: "Player D signs for a new club", link: "https://example.com", source: "Some Outlet", date: null },
    ]);

    await runAlerts(10_000);

    const alerts = await getAlertsBySlug();
    const rows = alerts.get("player-d") ?? [];
    const transfer = rows.find((a) => a.kind === "transfer");
    expect(transfer?.stage).toBe("official");
    expect(transfer?.detail).toContain("signs for a new club");
  });

  it("clears a transfer alert once no recent headline matches anymore", async () => {
    await trackViaCard("player-e", "Player E");
    vi.mocked(getPlayerMarket).mockResolvedValue({
      slug: "player-e",
      name: "Player E",
      floorByRarity: {}, floorInSeasonByRarity: {},
      listedCount: 0,
    });

    vi.mocked(searchPlayerNews).mockResolvedValueOnce([
      { title: "Player E in talks to leave the club", link: "https://a", source: "Outlet A", date: null },
    ]).mockResolvedValueOnce([
      { title: "Player E in talks to leave the club", link: "https://a", source: "Outlet A", date: null },
    ]);
    await runAlerts(10_000);
    let alerts = await getAlertsBySlug();
    expect(alerts.get("player-e")?.find((a) => a.kind === "transfer")?.stage).toBe("negotiation");

    vi.mocked(searchPlayerNews).mockReset().mockResolvedValue([
      { title: "Player E scores a hat-trick at the weekend", link: "https://b", source: "Outlet A", date: null },
    ]);
    await runAlerts(10_000);
    alerts = await getAlertsBySlug();
    expect((alerts.get("player-e") ?? []).some((a) => a.kind === "transfer")).toBe(false);
  });

  it("also tracks watchlisted (non-owned) players", async () => {
    const group = await prisma.watchlistGroup.create({ data: { name: "Cibles" } });
    await prisma.watchlistItem.create({
      data: { playerSlug: "watched-only", label: "Watched Only", groupId: group.id },
    });
    vi.mocked(getPlayerMarket).mockResolvedValue({
      slug: "watched-only",
      name: "Watched Only",
      floorByRarity: { limited: 50 },
    floorInSeasonByRarity: { limited: 50 },
      listedCount: 1,
    });

    const progress = await runAlerts(10_000);
    expect(progress.priceChecked).toBeGreaterThanOrEqual(1);
    const snapshots = await prisma.priceSnapshot.findMany({ where: { playerSlug: "watched-only" } });
    expect(snapshots).toHaveLength(1);
  });
});
