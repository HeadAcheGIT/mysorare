import { describe, it, expect } from "vitest";
import { summarizeAccuracy } from "./alignedLineups";

describe("summarizeAccuracy", () => {
  it("ignores rows where the outcome isn't known yet", () => {
    const { ours, sorare } = summarizeAccuracy([
      { ourPStart: 0.9, sorareStarterOdds: 0.8, actualStarted: null },
    ]);
    expect(ours.graded).toBe(0);
    expect(ours.hitRate).toBeNull();
    expect(sorare.graded).toBe(0);
  });

  it("ignores rows where the source itself has no reading", () => {
    const { ours } = summarizeAccuracy([{ ourPStart: null, sorareStarterOdds: 0.8, actualStarted: true }]);
    expect(ours.graded).toBe(0);
    expect(ours.hitRate).toBeNull();
  });

  it("counts >= 50% predicted-to-start matching a real start as a hit", () => {
    const { ours } = summarizeAccuracy([
      { ourPStart: 0.9, sorareStarterOdds: null, actualStarted: true },
      { ourPStart: 0.2, sorareStarterOdds: null, actualStarted: false },
    ]);
    expect(ours.graded).toBe(2);
    expect(ours.hits).toBe(2);
    expect(ours.hitRate).toBe(1);
  });

  it("counts a confident miss as a miss, not a partial credit", () => {
    const { ours } = summarizeAccuracy([{ ourPStart: 0.95, sorareStarterOdds: null, actualStarted: false }]);
    expect(ours.hits).toBe(0);
    expect(ours.hitRate).toBe(0);
  });

  it("treats exactly 50% as predicting a start", () => {
    const { ours } = summarizeAccuracy([{ ourPStart: 0.5, sorareStarterOdds: null, actualStarted: true }]);
    expect(ours.hits).toBe(1);
  });

  it("computes the Brier score as mean squared error against the 0/1 outcome", () => {
    const { ours } = summarizeAccuracy([
      { ourPStart: 0.8, sorareStarterOdds: null, actualStarted: true }, // (0.8-1)^2 = 0.04
      { ourPStart: 0.3, sorareStarterOdds: null, actualStarted: false }, // (0.3-0)^2 = 0.09
    ]);
    expect(ours.brierScore).toBeCloseTo((0.04 + 0.09) / 2, 5);
  });

  it("grades both sources independently over the same rows", () => {
    const { ours, sorare } = summarizeAccuracy([
      { ourPStart: 0.9, sorareStarterOdds: 0.1, actualStarted: true },
    ]);
    expect(ours.hits).toBe(1);
    expect(sorare.hits).toBe(0);
  });
});
