import { describe, it, expect } from "vitest";
import { classifyStartTrend, classifyFormTrend } from "./mercato";

describe("classifyStartTrend", () => {
  it("returns null with fewer than 5 fixtures of history", () => {
    expect(classifyStartTrend([0.9, 0.9, 0.1, 0.1])).toBeNull();
  });

  it("flags a real drop in starting time", () => {
    // Recent two fixtures near the bench, prior three nailed-on.
    const out = classifyStartTrend([0.1, 0.15, 0.9, 0.85, 0.8]);
    expect(out).not.toBeNull();
    expect(out!.direction).toBe("down");
    expect(out!.recentPct).toBe(13);
    expect(out!.priorPct).toBe(85);
  });

  it("flags a real rise in starting time", () => {
    const out = classifyStartTrend([0.9, 0.85, 0.1, 0.15, 0.2]);
    expect(out).not.toBeNull();
    expect(out!.direction).toBe("up");
  });

  it("ignores a small wobble under the 20-point threshold", () => {
    expect(classifyStartTrend([0.6, 0.55, 0.5, 0.52, 0.48])).toBeNull();
  });

  it("is order-sensitive: newest first", () => {
    // Same five values, reversed — should read as a rise, not a drop.
    const dropping = classifyStartTrend([0.1, 0.15, 0.9, 0.85, 0.8]);
    const rising = classifyStartTrend([0.8, 0.85, 0.9, 0.15, 0.1]);
    expect(dropping!.direction).toBe("down");
    expect(rising!.direction).toBe("up");
  });
});

describe("classifyFormTrend", () => {
  it("returns null under six games of history", () => {
    expect(classifyFormTrend([80, 70, 60, 50, 40])).toBeNull();
  });

  it("flags a genuine rise, matching insights.ts's own threshold", () => {
    // Last 3 average 70, the 4 before average 40 → +30, above the 12-point bar.
    const out = classifyFormTrend([70, 70, 70, 40, 40, 40, 40]);
    expect(out).toEqual({ delta: 30 });
  });

  it("never flags a decline — this signal is upside-only", () => {
    const out = classifyFormTrend([40, 40, 40, 70, 70, 70, 70]);
    expect(out).toBeNull();
  });

  it("ignores a rise under the 12-point bar", () => {
    const out = classifyFormTrend([45, 45, 45, 40, 40, 40, 40]);
    expect(out).toBeNull();
  });
});
