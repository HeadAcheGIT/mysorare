import { describe, it, expect } from "vitest";
import { computeRegret, regretVerdict, scoreLineup, type ScoredCard } from "./debrief";

const card = (slug: string, score: number | null, over: Partial<ScoredCard> = {}): ScoredCard => ({
  cardSlug: slug,
  playerSlug: slug,
  playerName: slug,
  position: "Midfielder",
  score,
  ...over,
});

describe("scoreLineup", () => {
  it("sums the scores", () => {
    expect(scoreLineup([card("a", 50), card("b", 60)])).toBe(110);
  });

  it("applies the captain multiplier to one card only", () => {
    // 50 * 1.2 + 60 = 120
    expect(scoreLineup([card("a", 50, { captain: true }), card("b", 60)])).toBe(120);
  });

  it("counts a card that did not play as zero rather than skipping it", () => {
    // Skipping would flatter the total: an absent player still cost a slot.
    expect(scoreLineup([card("a", 50), card("b", null)])).toBe(50);
  });

  it("handles an empty line-up", () => {
    expect(scoreLineup([])).toBe(0);
  });
});

describe("computeRegret", () => {
  it("prices the gap between fielded and best available", () => {
    const actual = [card("a", 30), card("b", 40)];
    const best = [card("c", 80), card("b", 40)];
    const r = computeRegret(actual, best);
    expect(r.actual).toBe(70);
    expect(r.best).toBe(120);
    expect(r.points).toBe(50);
  });

  it("names what was missed and what should have been dropped", () => {
    const r = computeRegret([card("a", 30), card("b", 40)], [card("c", 80), card("b", 40)]);
    expect(r.missed.map((c) => c.cardSlug)).toEqual(["c"]);
    expect(r.dropped.map((c) => c.cardSlug)).toEqual(["a"]);
  });

  it("reports no regret for an optimal line-up", () => {
    const same = [card("a", 50), card("b", 60)];
    expect(computeRegret(same, same).points).toBe(0);
  });

  it("never reports a negative regret", () => {
    // Happens when the pool is incomplete — a card sold since the game week.
    // "You did better than possible" would be a nonsense reading.
    const r = computeRegret([card("a", 100)], [card("b", 40)]);
    expect(r.points).toBe(0);
  });

  it("ranks missed cards by what they would have brought", () => {
    const r = computeRegret([card("x", 10)], [card("a", 40), card("b", 90)]);
    expect(r.missed.map((c) => c.cardSlug)).toEqual(["b", "a"]);
  });

  it("takes the captain bonus into account on both sides", () => {
    const actual = [card("a", 50)];
    const best = [card("a", 50, { captain: true })];
    // Same card, captained: 60 against 50.
    expect(computeRegret(actual, best).points).toBe(10);
  });
});

describe("regretVerdict", () => {
  it("calls a near-optimal line-up good", () => {
    expect(regretVerdict({ actual: 98, best: 100, points: 2, missed: [], dropped: [] }).tone).toBe("ok");
  });

  it("flags a large loss", () => {
    expect(regretVerdict({ actual: 50, best: 100, points: 50, missed: [], dropped: [] }).tone).toBe("warn");
  });

  it("says nothing when there is no score to compare", () => {
    expect(regretVerdict({ actual: 0, best: 0, points: 0, missed: [], dropped: [] }).tone).toBe("neutral");
  });
});
