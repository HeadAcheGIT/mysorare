import { describe, it, expect } from "vitest";
import {
  median,
  estimateGapCost,
  statusOf,
  scoreOpportunity,
  buildOpportunity,
  type MarketSample,
  type OpportunityInput,
} from "./divisionAdvisor";

const base: OpportunityInput = {
  divisionSlug: "d1",
  displayName: "Division 1",
  trackName: "Champion Europe",
  division: 1,
  rarityType: "limited",
  seasonality: "IN_SEASON",
  canCompose: false,
  canComposeReason: null,
  missingCards: 0,
  missingPositions: [],
  missingRarities: [],
  notEnoughEligibleCards: false,
  prizePool: 100,
  prizePoolCurrency: "EUR",
  hasLineup: false,
  eligibility: [],
  transferMarketFilters: null,
  cutOffDate: null,
};

describe("median", () => {
  it("is null on an empty sample", () => {
    expect(median([])).toBeNull();
  });

  it("takes the middle value for an odd count", () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  it("averages the two middle values for an even count", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it("does not mutate its input", () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe("estimateGapCost", () => {
  const samples: MarketSample[] = [
    { position: "Defender", rarity: "limited", inSeasonFloorEur: 10 },
    { position: "Defender", rarity: "limited", inSeasonFloorEur: 30 },
    { position: "Defender", rarity: "rare", inSeasonFloorEur: 500 },
    { position: "Forward", rarity: "limited", inSeasonFloorEur: 50 },
  ];

  it("costs nothing when nothing is missing", () => {
    expect(estimateGapCost([], "limited", samples)).toEqual({ total: 0, perPosition: [] });
  });

  it("uses the median of the matching position and rarity", () => {
    const out = estimateGapCost(["Defender"], "limited", samples);
    expect(out.perPosition[0]).toEqual({ position: "Defender", eur: 20, sampleSize: 2 });
    expect(out.total).toBe(20);
  });

  it("filters by rarity so a rare listing never prices a limited slot", () => {
    const out = estimateGapCost(["Defender"], "rare", samples);
    expect(out.perPosition[0].eur).toBe(500);
  });

  it("sums across several missing slots", () => {
    expect(estimateGapCost(["Defender", "Forward"], "limited", samples).total).toBe(70);
  });

  it("returns a null total when any slot has no sample, rather than understating it", () => {
    const out = estimateGapCost(["Defender", "Goalkeeper"], "limited", samples);
    expect(out.total).toBeNull();
    expect(out.perPosition.find((p) => p.position === "Goalkeeper")).toEqual({
      position: "Goalkeeper",
      eur: null,
      sampleSize: 0,
    });
  });
});

describe("statusOf", () => {
  it("reports an existing line-up first, even when eligible", () => {
    expect(statusOf({ hasLineup: true, canCompose: true, missingCards: 0, notEnoughEligibleCards: false })).toBe(
      "lineup_in"
    );
  });

  it("is ready when Sorare says the line-up can be entered", () => {
    expect(statusOf({ hasLineup: false, canCompose: true, missingCards: 0, notEnoughEligibleCards: false })).toBe(
      "ready"
    );
  });

  it("is close when short by a couple of cards", () => {
    expect(statusOf({ hasLineup: false, canCompose: false, missingCards: 2, notEnoughEligibleCards: true })).toBe(
      "close"
    );
  });

  it("is far when short by more", () => {
    expect(statusOf({ hasLineup: false, canCompose: false, missingCards: 3, notEnoughEligibleCards: true })).toBe(
      "far"
    );
  });

  it("is locked when ineligible for a reason buying cards wouldn't fix", () => {
    expect(statusOf({ hasLineup: false, canCompose: false, missingCards: 0, notEnoughEligibleCards: false })).toBe(
      "locked"
    );
  });
});

describe("scoreOpportunity", () => {
  it("scores a locked division at zero", () => {
    expect(scoreOpportunity("locked", base, null)).toBe(0);
  });

  it("all but ignores a division already fielded — there's no decision left", () => {
    expect(scoreOpportunity("lineup_in", base, null)).toBeLessThan(0.1);
  });

  it("ranks a playable division above one short of cards", () => {
    const ready = scoreOpportunity("ready", { ...base, canCompose: true }, null);
    const close = scoreOpportunity("close", { ...base, missingCards: 2 }, null);
    expect(ready).toBeGreaterThan(close);
  });

  it("prefers the bigger prize pool at equal readiness", () => {
    const small = scoreOpportunity("ready", { ...base, canCompose: true, prizePool: 100 }, null);
    const big = scoreOpportunity("ready", { ...base, canCompose: true, prizePool: 10_000 }, null);
    expect(big).toBeGreaterThan(small);
  });

  it("log-scales the pool so a 100x bigger prize isn't 100x the score", () => {
    const small = scoreOpportunity("ready", { ...base, canCompose: true, prizePool: 100 }, null);
    const big = scoreOpportunity("ready", { ...base, canCompose: true, prizePool: 10_000 }, null);
    expect(big / small).toBeLessThan(3);
  });

  it("demotes but does not disqualify an unaffordable division", () => {
    const affordable = scoreOpportunity("close", base, true);
    const not = scoreOpportunity("close", base, false);
    expect(not).toBeLessThan(affordable);
    expect(not).toBeGreaterThan(0);
  });
});

describe("buildOpportunity", () => {
  const samples: MarketSample[] = [
    { position: "Defender", rarity: "limited", inSeasonFloorEur: 40 },
    { position: "Defender", rarity: "limited", inSeasonFloorEur: 60 },
  ];

  it("skips costing a division that needs nothing", () => {
    const out = buildOpportunity({ ...base, canCompose: true }, samples, 100);
    expect(out.status).toBe("ready");
    expect(out.cost).toBeNull();
    expect(out.affordable).toBeNull();
    expect(out.label).toContain("Prêt");
  });

  it("prices the gap and calls it affordable within budget", () => {
    const out = buildOpportunity(
      { ...base, missingCards: 1, missingPositions: ["Defender"], notEnoughEligibleCards: true },
      samples,
      100
    );
    expect(out.cost?.total).toBe(50);
    expect(out.affordable).toBe(true);
    expect(out.label).toContain("1 carte");
    expect(out.label).toContain("Defender");
  });

  it("calls it unaffordable past the budget", () => {
    const out = buildOpportunity(
      { ...base, missingCards: 1, missingPositions: ["Defender"], notEnoughEligibleCards: true },
      samples,
      10
    );
    expect(out.affordable).toBe(false);
  });

  it("leaves affordability unknown without a budget rather than assuming", () => {
    const out = buildOpportunity(
      { ...base, missingCards: 1, missingPositions: ["Defender"], notEnoughEligibleCards: true },
      samples,
      null
    );
    expect(out.affordable).toBeNull();
  });

  it("leaves affordability unknown when the gap can't be priced", () => {
    const out = buildOpportunity(
      { ...base, missingCards: 1, missingPositions: ["Goalkeeper"], notEnoughEligibleCards: true },
      samples,
      1000
    );
    expect(out.cost?.total).toBeNull();
    expect(out.affordable).toBeNull();
  });
});
