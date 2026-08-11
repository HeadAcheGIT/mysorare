import { describe, it, expect } from "vitest";
import { isStale, daysSince, isTrendingGood, STALE_DAYS } from "./sparkline";

describe("isStale — the Héctor Holguín regression", () => {
  it("is not stale without a lastPlayedAt (unknown, not misleading)", () => {
    expect(isStale(null)).toBe(false);
    expect(isStale(undefined)).toBe(false);
  });

  it("is not stale for a game played yesterday", () => {
    const yesterday = new Date(Date.now() - 1 * 86_400_000).toISOString();
    expect(isStale(yesterday)).toBe(false);
  });

  it("is not stale exactly at the threshold", () => {
    const now = Date.now();
    const atThreshold = new Date(now - STALE_DAYS * 86_400_000).toISOString();
    expect(isStale(atThreshold, now)).toBe(false);
  });

  it("is stale just past the threshold", () => {
    const now = Date.now();
    const pastThreshold = new Date(now - (STALE_DAYS + 1) * 86_400_000).toISOString();
    expect(isStale(pastThreshold, now)).toBe(true);
  });

  it("flags the reported case: last appearance 107 days ago", () => {
    const now = Date.now();
    const longAgo = new Date(now - 107 * 86_400_000).toISOString();
    expect(isStale(longAgo, now)).toBe(true);
  });
});

describe("daysSince", () => {
  it("computes whole and fractional days from a fixed clock", () => {
    const now = new Date("2026-08-11T00:00:00.000Z").getTime();
    const tenDaysAgo = new Date("2026-08-01T00:00:00.000Z").toISOString();
    expect(daysSince(tenDaysAgo, now)).toBeCloseTo(10, 5);
  });
});

describe("isTrendingGood", () => {
  it("is false for an empty series", () => {
    expect(isTrendingGood([])).toBe(false);
  });

  it("is true when the last score is at least the average", () => {
    expect(isTrendingGood([40, 50, 60])).toBe(true); // last(60) >= avg(50)
  });

  it("is false when the last score is below the average", () => {
    expect(isTrendingGood([80, 70, 30])).toBe(false); // last(30) < avg(60)
  });

  it("is true for a single flat value (last === avg)", () => {
    expect(isTrendingGood([55])).toBe(true);
  });
});
