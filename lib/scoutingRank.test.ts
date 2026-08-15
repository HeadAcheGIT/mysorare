import { describe, it, expect } from "vitest";
import { reliableForm, valuePerEuro, isThinSample, type RankablePlayer } from "./scoutingRank";

const p = (avgL5: number | null, app15: number | null, price?: number): RankablePlayer => ({
  avgL5,
  app15,
  inSeasonTrend: price == null ? null : { lastSale: { amount: price, currency: "EUR" } },
});

describe("isThinSample", () => {
  it("flags a player with almost no playing time", () => {
    expect(isThinSample(1)).toBe(true);
    expect(isThinSample(0)).toBe(true);
  });

  it("does not flag a regular", () => {
    expect(isThinSample(14)).toBe(false);
  });

  it("treats unknown playing time as thin rather than assuming the best", () => {
    expect(isThinSample(null)).toBe(true);
  });
});

describe("reliableForm", () => {
  it("is null without a form average", () => {
    expect(reliableForm(p(null, 15))).toBeNull();
  });

  /**
   * The case that motivated this: a reserve goalkeeper with one appearance and
   * a huge score used to outrank every regular starter in the league.
   */
  it("ranks a one-game wonder below a solid regular", () => {
    const reserveKeeper = reliableForm(p(85, 1))!;
    const regularStarter = reliableForm(p(74, 14))!;
    expect(reserveKeeper).toBeLessThan(regularStarter);
  });

  it("barely discounts a player who plays every week", () => {
    const full = reliableForm(p(70, 15))!;
    expect(full).toBeGreaterThan(70 * 0.75);
  });

  it("still prefers the better player at equal playing time", () => {
    expect(reliableForm(p(80, 15))!).toBeGreaterThan(reliableForm(p(60, 15))!);
  });

  it("treats no playing time as worthless form rather than as unknown", () => {
    expect(reliableForm(p(90, 0))).toBe(0);
  });
});

describe("valuePerEuro", () => {
  it("prefers equal form at a lower price", () => {
    expect(valuePerEuro(p(70, 15, 20))!).toBeGreaterThan(valuePerEuro(p(70, 15, 100))!);
  });

  it("prefers better form at an equal price", () => {
    expect(valuePerEuro(p(80, 15, 50))!).toBeGreaterThan(valuePerEuro(p(60, 15, 50))!);
  });

  it("does not rank an unpriced player as infinite value", () => {
    expect(valuePerEuro(p(80, 15))).toBeNull();
    expect(valuePerEuro(p(80, 15, 0))).toBeNull();
  });

  it("carries the sample-size discount through, so a cheap one-game wonder isn't a bargain", () => {
    const oneGame = valuePerEuro(p(85, 1, 3.42))!;
    const regular = valuePerEuro(p(74, 14, 52))!;
    // 85 points for 3.42 € looks unbeatable until you notice he never plays.
    expect(oneGame).toBeLessThan(85 / 3.42);
    expect(regular).toBeGreaterThan(0);
  });
});
