import { describe, it, expect } from "vitest";
import { computeForm, startedFrom, type AppearanceLike } from "./projections";

const app = (over: Partial<AppearanceLike> = {}): AppearanceLike => ({
  minutes: 90,
  started: true,
  score: 50,
  formationPlace: 11,
  ...over,
});

/**
 * The cases below are taken from a real player's record pulled from Sorare's
 * API while diagnosing the bug, because both are ones the old minutes-based
 * rule got wrong.
 */
describe("startedFrom", () => {
  it("counts a starter subbed at half time as a start (45 min, formation 11)", () => {
    expect(startedFrom(app({ minutes: 45, formationPlace: 11 }))).toBe(true);
  });

  it("does not count a one-minute substitute as a start (1 min, formation 0)", () => {
    expect(startedFrom(app({ minutes: 1, formationPlace: 0 }))).toBe(false);
  });

  it("does not promote a substitute who happened to play an hour", () => {
    // The old rule OR-ed minutes >= 60 in and called this a start.
    expect(startedFrom(app({ minutes: 75, formationPlace: 0, started: false }))).toBe(false);
  });

  it("falls back to minutes only when the formation place is unknown", () => {
    expect(startedFrom(app({ minutes: 90, formationPlace: null, started: false }))).toBe(true);
    expect(startedFrom(app({ minutes: 10, formationPlace: null, started: false }))).toBe(false);
  });

  it("honours a stored started flag when nothing better exists", () => {
    expect(startedFrom(app({ minutes: 30, formationPlace: null, started: true }))).toBe(true);
  });
});

describe("computeForm", () => {
  const many = (n: number, over: Partial<AppearanceLike> = {}) => Array.from({ length: n }, () => app(over));

  it("falls back to the baseline with no history", () => {
    const f = computeForm([], "Forward", false, false, 1, 0);
    expect(f.pStartBasis).toBe("baseline");
    expect(f.pStart).toBeGreaterThan(0);
  });

  it("rates a consistent starter high", () => {
    const f = computeForm(many(15), "Forward", false, false, 1, 0);
    expect(f.pStart).toBeGreaterThan(0.8);
    expect(f.pStartBasis).toBe("starts");
  });

  it("keeps a regular substitute's start probability low but his play probability high", () => {
    const f = computeForm(many(15, { minutes: 20, formationPlace: 0, started: false }), "Forward", false, false, 1, 0);
    expect(f.pStart).toBeLessThan(0.25);
    expect(f.pPlay).toBeGreaterThan(0.7);
  });

  it("separates an unused substitute from one who comes on", () => {
    const unused = computeForm(
      many(15, { minutes: 0, formationPlace: 0, started: false, score: 0 }),
      "Forward",
      false,
      false,
      1,
      0
    );
    expect(unused.pPlay).toBeLessThan(0.25);
  });

  it("never reports a start probability above the play probability", () => {
    const f = computeForm(
      [app({ minutes: 90, formationPlace: 11 }), ...many(10, { minutes: 0, formationPlace: 0, started: false })],
      "Forward",
      false,
      false,
      1,
      0
    );
    expect(f.pStart).toBeLessThanOrEqual(f.pPlay);
  });

  it("zeroes both probabilities when injured or suspended", () => {
    const injured = computeForm(many(10), "Forward", true, false, 1, 0);
    const suspended = computeForm(many(10), "Forward", false, true, 1, 0);
    expect(injured.pStart).toBe(0);
    expect(injured.pPlay).toBe(0);
    expect(suspended.pStart).toBe(0);
    expect(suspended.pPlay).toBe(0);
  });

  it("marks the basis as appearances when no formation place is available", () => {
    const f = computeForm(many(10, { formationPlace: null }), "Forward", false, false, 1, 0);
    expect(f.pStartBasis).toBe("appearances");
  });

  it("scales the expected score by the card bonus", () => {
    const plain = computeForm(many(10), "Forward", false, false, 1, 0);
    const boosted = computeForm(many(10), "Forward", false, false, 1, 0.2);
    expect(boosted.expected).toBeGreaterThan(plain.expected);
  });
});
