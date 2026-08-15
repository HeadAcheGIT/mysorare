import { describe, it, expect } from "vitest";
import {
  distinctMarkets,
  staleTargets,
  valuationKey,
  VALUATION_TTL_HOURS,
  type Holding,
} from "./valuationTargets";

const NOW = new Date("2026-08-15T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const lopezIS: Holding = { playerSlug: "maxime-lopez", rarity: "limited", inSeason: true };
const lopezClassic: Holding = { playerSlug: "maxime-lopez", rarity: "limited", inSeason: false };
const lopezRare: Holding = { playerSlug: "maxime-lopez", rarity: "rare", inSeason: true };
const haaland: Holding = { playerSlug: "erling-haland", rarity: "limited", inSeason: true };

describe("valuationKey", () => {
  it("separates in-season from classic", () => {
    expect(valuationKey(lopezIS)).not.toBe(valuationKey(lopezClassic));
  });

  it("separates rarities", () => {
    expect(valuationKey(lopezIS)).not.toBe(valuationKey(lopezRare));
  });
});

describe("distinctMarkets", () => {
  it("collapses several cards of the same market into one", () => {
    // Five Lopez in-season limiteds are one market, so one request.
    const holdings = Array.from({ length: 5 }, () => ({ ...lopezIS }));
    expect(distinctMarkets(holdings)).toHaveLength(1);
  });

  it("keeps in-season and classic apart", () => {
    // The whole point of the split: 6,68 € against 0,46 € on the same day.
    expect(distinctMarkets([lopezIS, lopezClassic])).toHaveLength(2);
  });

  it("drops rows with no player or rarity", () => {
    const holdings = [lopezIS, { playerSlug: "", rarity: "limited", inSeason: true }] as Holding[];
    expect(distinctMarkets(holdings)).toEqual([lopezIS]);
  });

  it("returns nothing for an empty gallery", () => {
    expect(distinctMarkets([])).toEqual([]);
  });
});

describe("staleTargets", () => {
  it("returns everything when nothing has ever been computed", () => {
    expect(staleTargets([lopezIS, haaland], [], NOW)).toHaveLength(2);
  });

  it("puts never-computed markets ahead of merely stale ones", () => {
    // A card showing "—" is worse than one showing a slightly old number, so
    // it must be refreshed first even though the stale one is older by clock.
    const cached = [{ ...lopezIS, computedAt: hoursAgo(100) }];
    const order = staleTargets([lopezIS, haaland], cached, NOW);
    expect(order[0].playerSlug).toBe("erling-haland");
    expect(order[1].playerSlug).toBe("maxime-lopez");
  });

  it("orders stale markets oldest first", () => {
    const cached = [
      { ...lopezIS, computedAt: hoursAgo(48) },
      { ...haaland, computedAt: hoursAgo(72) },
    ];
    expect(staleTargets([lopezIS, haaland], cached, NOW).map((h) => h.playerSlug)).toEqual([
      "erling-haland",
      "maxime-lopez",
    ]);
  });

  it("skips valuations still inside the TTL", () => {
    const cached = [{ ...lopezIS, computedAt: hoursAgo(VALUATION_TTL_HOURS - 1) }];
    expect(staleTargets([lopezIS], cached, NOW)).toEqual([]);
  });

  it("refreshes once past the TTL", () => {
    const cached = [{ ...lopezIS, computedAt: hoursAgo(VALUATION_TTL_HOURS + 1) }];
    expect(staleTargets([lopezIS], cached, NOW)).toHaveLength(1);
  });

  it("does not treat a cached in-season entry as covering the classic market", () => {
    // Sharing a key here would leave classic cards permanently unvalued.
    const cached = [{ ...lopezIS, computedAt: hoursAgo(1) }];
    expect(staleTargets([lopezIS, lopezClassic], cached, NOW)).toEqual([lopezClassic]);
  });

  it("costs nothing on a second refresh straight after a first", () => {
    const cached = [
      { ...lopezIS, computedAt: NOW },
      { ...haaland, computedAt: NOW },
    ];
    expect(staleTargets([lopezIS, haaland], cached, NOW)).toEqual([]);
  });

  it("ignores a cached entry for a card no longer held", () => {
    const cached = [{ ...haaland, computedAt: hoursAgo(1) }];
    expect(staleTargets([lopezIS], cached, NOW)).toEqual([lopezIS]);
  });

  it("treats an unparseable timestamp as never computed", () => {
    const cached = [{ ...lopezIS, computedAt: new Date("nonsense") }];
    expect(staleTargets([lopezIS], cached, NOW)).toEqual([lopezIS]);
  });
});
