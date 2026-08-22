import { describe, it, expect } from "vitest";
import { toCandidates, computeDelta, roiScore, weightedScore, DEFAULT_LINEUP_WEIGHTS, type BenchCard } from "./divisionLineup";

const card = (over: Partial<BenchCard> = {}): BenchCard => ({
  benchObjectId: "b1",
  cardSlug: "card-1",
  playerSlug: "player-1",
  playerName: "Player One",
  position: "Forward",
  rarity: "limited",
  bonus: 0,
  sorareProjected: null,
  locked: false,
  ourExpected: null,
  ourPStart: null,
  sorareStarterOdds: null,
  l5: null,
  l15: null,
  ...over,
});

describe("toCandidates", () => {
  it("drops locked cards — they cannot be fielded, so proposing them is unusable advice", () => {
    const out = toCandidates([card({ locked: true }), card({ cardSlug: "card-2", locked: false })]);
    expect(out.map((c) => c.cardSlug)).toEqual(["card-2"]);
  });

  it("drops bench entries with no card slug", () => {
    expect(toCandidates([card({ cardSlug: null })])).toHaveLength(0);
  });

  it("prefers our own projection", () => {
    const [c] = toCandidates([card({ ourExpected: 42, sorareProjected: 10 })]);
    expect(c.expected).toBe(42);
  });

  it("falls back to Sorare's projection so an un-enriched card isn't valued at zero", () => {
    const [c] = toCandidates([card({ ourExpected: null, sorareProjected: 33 })]);
    expect(c.expected).toBe(33);
  });

  it("uses zero only when neither source has a number", () => {
    const [c] = toCandidates([card()]);
    expect(c.expected).toBe(0);
  });

  it("re-weighting changes the score, defaults leave it untouched", () => {
    const b = card({ ourExpected: 40, ourPStart: 0.8, l5: 60, l15: 40 });
    const [withDefaults] = toCandidates([b]);
    const [withCustom] = toCandidates([b], { form: 1, titu: 0, proj: 0 });
    expect(withDefaults.expected).toBe(40); // pure proj, same as before weights existed
    expect(withCustom.expected).toBeCloseTo(0.65 * 60 + 0.35 * 40); // pure form
    expect(withCustom.expected).not.toBe(withDefaults.expected);
  });
});

describe("weightedScore", () => {
  it("with default weights, reproduces the old ourExpected-first formula", () => {
    expect(weightedScore({ l5: 80, l15: 20, ourPStart: 1, ourExpected: 42, sorareProjected: 99 }, DEFAULT_LINEUP_WEIGHTS)).toBe(42);
    expect(weightedScore({ l5: 80, l15: 20, ourPStart: 1, ourExpected: null, sorareProjected: 33 }, DEFAULT_LINEUP_WEIGHTS)).toBe(33);
    expect(weightedScore({ l5: null, l15: null, ourPStart: null, ourExpected: null, sorareProjected: null }, DEFAULT_LINEUP_WEIGHTS)).toBe(0);
  });

  it("blends the 65/35 L5/L15 split for pure form weight", () => {
    const score = weightedScore(
      { l5: 60, l15: 40, ourPStart: null, ourExpected: 999, sorareProjected: null },
      { form: 1, titu: 0, proj: 0 }
    );
    expect(score).toBeCloseTo(0.65 * 60 + 0.35 * 40);
  });

  it("falls back to whichever of L5/L15 is known when the other is missing", () => {
    const score = weightedScore(
      { l5: 50, l15: null, ourPStart: null, ourExpected: null, sorareProjected: null },
      { form: 1, titu: 0, proj: 0 }
    );
    expect(score).toBe(50);
  });

  it("discounts form by starting probability for the titularisation weight", () => {
    const nailedOn = weightedScore(
      { l5: 60, l15: 60, ourPStart: 1, ourExpected: null, sorareProjected: null },
      { form: 0, titu: 1, proj: 0 }
    );
    const rotationRisk = weightedScore(
      { l5: 60, l15: 60, ourPStart: 0.3, ourExpected: null, sorareProjected: null },
      { form: 0, titu: 1, proj: 0 }
    );
    expect(nailedOn).toBe(60);
    expect(rotationRisk).toBeCloseTo(18);
    expect(rotationRisk).toBeLessThan(nailedOn);
  });

  it("mixes all three components proportionally to their weight", () => {
    const b = { l5: 100, l15: 100, ourPStart: 1, ourExpected: 0, sorareProjected: null };
    // form=100, titu=100*1=100, proj=0 — an even split should land at 2/3 of 100.
    expect(weightedScore(b, { form: 1 / 3, titu: 1 / 3, proj: 1 / 3 })).toBeCloseTo(200 / 3);
  });
});

describe("computeDelta", () => {
  it("reports no current total when nothing is fielded", () => {
    const d = computeDelta([], [{ cardSlug: "a" }], 100);
    expect(d.currentTotal).toBeNull();
    expect(d.gain).toBeNull();
    expect(d.cardsIn).toEqual(["a"]);
    expect(d.cardsOut).toEqual([]);
  });

  it("computes the gain against a scored current line-up", () => {
    const d = computeDelta(
      [
        { cardSlug: "a", expected: 30 },
        { cardSlug: "b", expected: 20 },
      ],
      [{ cardSlug: "a" }, { cardSlug: "c" }],
      80
    );
    expect(d.currentTotal).toBe(50);
    expect(d.gain).toBe(30);
  });

  it("names exactly which cards come in and go out", () => {
    const d = computeDelta(
      [
        { cardSlug: "a", expected: 10 },
        { cardSlug: "b", expected: 10 },
      ],
      [{ cardSlug: "b" }, { cardSlug: "c" }],
      40
    );
    expect(d.cardsIn).toEqual(["c"]);
    expect(d.cardsOut).toEqual(["a"]);
  });

  it("refuses to score a current line-up with no projections rather than inventing a gain", () => {
    const d = computeDelta([{ cardSlug: "a", expected: null }], [{ cardSlug: "b" }], 60);
    expect(d.currentTotal).toBeNull();
    expect(d.gain).toBeNull();
  });

  it("can report a negative gain — the proposal is not always better", () => {
    const d = computeDelta([{ cardSlug: "a", expected: 90 }], [{ cardSlug: "b" }], 70);
    expect(d.gain).toBe(-20);
  });
});

describe("roiScore", () => {
  it("is reward per projected point", () => {
    expect(roiScore(1000, 100)).toBe(10);
  });

  it("is null without a prize pool", () => {
    expect(roiScore(null, 100)).toBeNull();
  });

  it("is null without a projection, so an unscored division can't top the ranking", () => {
    expect(roiScore(1000, null)).toBeNull();
    expect(roiScore(1000, 0)).toBeNull();
  });

  it("ranks a richer division above a poorer one at equal projection", () => {
    expect(roiScore(2000, 100)!).toBeGreaterThan(roiScore(500, 100)!);
  });
});
