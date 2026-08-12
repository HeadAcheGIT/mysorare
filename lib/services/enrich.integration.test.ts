import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../prisma";

// Only publicGraphql is mocked — PLAYERS_BY_SLUG/PLAYERS_PER_QUERY stay real
// so the batch-size math (15/page) is exactly what production runs.
vi.mock("../sorare/publicClient", async (importActual) => {
  const actual = await importActual<typeof import("../sorare/publicClient")>();
  return { ...actual, publicGraphql: vi.fn() };
});

import { publicGraphql, PLAYERS_PER_QUERY } from "../sorare/publicClient";
import { enrichBatch } from "./enrich";

/**
 * This is the regression test for a real incident: a bad field name in
 * PLAYERS_BY_SLUG (querying `birthDate` on an interface that doesn't expose
 * it) made every single enrichment batch throw, and because the batch loop
 * had no try/catch, the *entire* call failed — silently, since nothing
 * logged it anywhere a user would see (no SyncLog row, no UI error). It went
 * unnoticed for hours. These tests pin the fix: one bad page must not sink
 * the others, and any failure must leave a visible trace.
 */

const fakePlayer = (slug: string) => ({
  slug,
  displayName: slug,
  age: 25,
  birthDate: "2000-01-01",
  shirtNumber: 9,
  anyPositions: ["Forward"],
  avatarPictureUrl: null,
  squaredPictureUrl: null,
  country: { code: "fr" },
  activeClub: null,
  activeInjuries: [],
  activeSuspensions: [],
  nextClassicFixtureProjectedScore: null,
  lastFiveSo5Appearances: null,
  lastFifteenSo5Appearances: null,
  seasonAppearances: null,
  avgL5: null,
  avgL15: null,
  avgL10Played: null,
  rawPlayerGameScores: [],
});

async function seedDuePlayers(n: number) {
  await prisma.player.createMany({
    data: Array.from({ length: n }, (_, i) => ({
      slug: `player-${String(i).padStart(3, "0")}`,
      displayName: `Player ${i}`,
      position: "Forward",
      // Nulls-first ordering: leaving enrichedAt unset means every seeded
      // player is "due" and the batch order is deterministic by slug.
    })),
  });
}

async function cleanDb() {
  await prisma.syncLog.deleteMany();
  await prisma.player.deleteMany();
  await prisma.club.deleteMany();
}

describe("enrichBatch resilience", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.mocked(publicGraphql).mockReset();
  });
  afterAll(cleanDb);

  it("a query-level bug that fails every page is fully visible: failed count, and an error SyncLog row", async () => {
    await seedDuePlayers(PLAYERS_PER_QUERY + 5); // forces 2 pages
    vi.mocked(publicGraphql).mockRejectedValue(new Error("GraphQL: Field 'birthDate' doesn't exist"));

    const result = await enrichBatch();

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(2); // both pages attempted, both failed
    expect(result.remaining).toBeGreaterThan(0); // nobody actually got enriched

    const log = await prisma.syncLog.findFirst({ where: { job: "enrich" }, orderBy: { ranAt: "desc" } });
    expect(log?.status).toBe("error");
    expect(log?.detail).toContain("birthDate");
  });

  it("one bad page doesn't sink the others — the rest still get enriched", async () => {
    await seedDuePlayers(PLAYERS_PER_QUERY + 5);
    let call = 0;
    vi.mocked(publicGraphql).mockImplementation(async (_query, vars) => {
      call++;
      const slugs = (vars as { slugs: string[] }).slugs;
      if (call === 1) throw new Error("simulated transient failure");
      return { players: slugs.map(fakePlayer) };
    });

    const result = await enrichBatch();

    expect(result.failed).toBe(1);
    expect(result.processed).toBe(5); // the second, successful page
    const enriched = await prisma.player.count({ where: { enrichedAt: { not: null } } });
    expect(enriched).toBe(5);
  });

  it("a fully successful run logs ok, not error, and reports zero failed", async () => {
    await seedDuePlayers(3);
    vi.mocked(publicGraphql).mockImplementation(async (_q, vars) => ({
      players: (vars as { slugs: string[] }).slugs.map(fakePlayer),
    }));

    const result = await enrichBatch();

    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);
    const log = await prisma.syncLog.findFirst({ where: { job: "enrich" }, orderBy: { ranAt: "desc" } });
    expect(log?.status).toBe("ok");
  });

  it("populates birthDate from a successful batch (the actual feature this incident broke)", async () => {
    await seedDuePlayers(1);
    vi.mocked(publicGraphql).mockResolvedValue({ players: [fakePlayer("player-000")] });

    await enrichBatch();

    const player = await prisma.player.findUnique({ where: { slug: "player-000" } });
    expect(player?.birthDate?.toISOString().slice(0, 10)).toBe("2000-01-01");
  });
});
