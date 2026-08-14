import { describe, it, expect } from "vitest";
import { toCandidates, computeDelta, roiScore, type BenchCard } from "./divisionLineup";

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
