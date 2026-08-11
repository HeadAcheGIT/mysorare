import { describe, it, expect } from "vitest";
import { computeChangePct } from "./sales";

describe("computeChangePct", () => {
  it("is null without a current floor", () => {
    expect(computeChangePct(100, null)).toBeNull();
    expect(computeChangePct(100, undefined)).toBeNull();
  });

  it("is null without a reference price", () => {
    expect(computeChangePct(null, 100)).toBeNull();
    expect(computeChangePct(undefined, 100)).toBeNull();
  });

  it("is null when the reference is zero or negative", () => {
    expect(computeChangePct(0, 100)).toBeNull();
    expect(computeChangePct(-10, 100)).toBeNull();
  });

  it("computes a positive % when the floor rose (bad time to have sold)", () => {
    expect(computeChangePct(100, 150)).toBeCloseTo(50, 5);
  });

  it("computes a negative % when the floor dropped (good call to have sold)", () => {
    expect(computeChangePct(100, 80)).toBeCloseTo(-20, 5);
  });

  it("is zero when nothing changed", () => {
    expect(computeChangePct(100, 100)).toBe(0);
  });
});
