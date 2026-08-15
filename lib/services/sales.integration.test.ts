import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../prisma";

vi.mock("./market", () => ({ getPlayerMarket: vi.fn() }));
import { getPlayerMarket } from "./market";
import { listSales } from "./sales";

async function cleanDb() {
  await prisma.sale.deleteMany();
}

describe("listSales", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.mocked(getPlayerMarket).mockReset();
  });
  afterAll(cleanDb);

  it("attaches a live floor and a computed change % to each historical sale", async () => {
    await prisma.sale.create({
      data: {
        cardSlug: "kylian-mbappe-2024-limited-7",
        playerSlug: "kylian-mbappe",
        playerName: "Kylian Mbappé",
        rarity: "limited",
        season: 2024,
        serialNumber: 7,
        boughtPrice: 95,
        lastKnownPrice: 100,
      },
    });
    vi.mocked(getPlayerMarket).mockResolvedValue({
      slug: "kylian-mbappe",
      name: "Kylian Mbappé",
      floorByRarity: { limited: 150 }, floorInSeasonByRarity: { limited: 150 },
      listedCount: 1,
    });

    const [row] = await listSales();
    expect(row.currentFloor).toBe(150);
    expect(row.changePct).toBeCloseTo(50, 5); // price rose 50% since the sale — a discutable call
  });

  it("falls back to lastFloorPrice as the reference when lastKnownPrice is unknown", async () => {
    await prisma.sale.create({
      data: {
        cardSlug: "no-price-2024-common-1",
        playerSlug: "no-price-player",
        playerName: "No Price Player",
        rarity: "common",
        lastKnownPrice: null,
        lastFloorPrice: 40,
      },
    });
    vi.mocked(getPlayerMarket).mockResolvedValue({
      slug: "no-price-player",
      name: "No Price Player",
      floorByRarity: { common: 40 }, floorInSeasonByRarity: { common: 40 },
      listedCount: 1,
    });

    const [row] = await listSales();
    expect(row.changePct).toBe(0);
  });

  it("leaves changePct null when the live lookup fails, rather than fabricating a number", async () => {
    await prisma.sale.create({
      data: {
        cardSlug: "flaky-2024-common-1",
        playerSlug: "flaky-player",
        playerName: "Flaky Player",
        rarity: "common",
        lastKnownPrice: 20,
      },
    });
    vi.mocked(getPlayerMarket).mockRejectedValue(new Error("Sorare HTTP 500"));

    const [row] = await listSales();
    expect(row.currentFloor).toBeNull();
    expect(row.changePct).toBeNull();
  });

  it("only looks up the market once per (player, rarity) pair even with several sales sharing it", async () => {
    await prisma.sale.createMany({
      data: [
        {
          cardSlug: "same-player-2024-limited-1",
          playerSlug: "same-player",
          playerName: "Same Player",
          rarity: "limited",
          lastKnownPrice: 10,
        },
        {
          cardSlug: "same-player-2023-limited-2",
          playerSlug: "same-player",
          playerName: "Same Player",
          rarity: "limited",
          lastKnownPrice: 12,
        },
      ],
    });
    vi.mocked(getPlayerMarket).mockResolvedValue({
      slug: "same-player",
      name: "Same Player",
      floorByRarity: { limited: 15 }, floorInSeasonByRarity: { limited: 15 },
      listedCount: 1,
    });

    const rows = await listSales();
    expect(rows).toHaveLength(2);
    expect(getPlayerMarket).toHaveBeenCalledTimes(1);
  });

  it("orders sales newest-first", async () => {
    await prisma.sale.create({
      data: { cardSlug: "older-2024-common-1", playerSlug: "older", playerName: "Older", rarity: "common", detectedAt: new Date("2026-01-01") },
    });
    await prisma.sale.create({
      data: { cardSlug: "newer-2024-common-1", playerSlug: "newer", playerName: "Newer", rarity: "common", detectedAt: new Date("2026-06-01") },
    });
    vi.mocked(getPlayerMarket).mockResolvedValue({ slug: "x", name: "x", floorByRarity: {}, floorInSeasonByRarity: {}, listedCount: 0 });

    const rows = await listSales();
    expect(rows.map((r) => r.playerSlug)).toEqual(["newer", "older"]);
  });
});
