import { describe, it, expect } from "vitest";
import { classifyPriceChange, classifyValueChange } from "./alerts";

describe("classifyPriceChange", () => {
  it("is null without a previous price", () => {
    expect(classifyPriceChange(null, 100)).toEqual({ kind: null, detail: null });
    expect(classifyPriceChange(undefined, 100)).toEqual({ kind: null, detail: null });
  });

  it("is null when previous price is zero or negative (avoids division by zero)", () => {
    expect(classifyPriceChange(0, 100)).toEqual({ kind: null, detail: null });
    expect(classifyPriceChange(-5, 100)).toEqual({ kind: null, detail: null });
  });

  it("flags price_down for a drop of 10% or more", () => {
    const result = classifyPriceChange(100, 89);
    expect(result.kind).toBe("price_down");
    expect(result.detail).toContain("-11%");
  });

  it("flags price_up for a rise of 10% or more", () => {
    const result = classifyPriceChange(100, 111);
    expect(result.kind).toBe("price_up");
    expect(result.detail).toContain("+11%");
  });

  it("is null for a move within the threshold", () => {
    expect(classifyPriceChange(100, 105)).toEqual({ kind: null, detail: null });
    expect(classifyPriceChange(100, 95)).toEqual({ kind: null, detail: null });
  });

  it("is exactly at the boundary (10.0%) on the alerting side", () => {
    expect(classifyPriceChange(100, 90).kind).toBe("price_down");
    expect(classifyPriceChange(100, 110).kind).toBe("price_up");
  });

  it("respects a custom threshold", () => {
    expect(classifyPriceChange(100, 103, 0.02).kind).toBe("price_up");
    expect(classifyPriceChange(100, 103, 0.5).kind).toBeNull();
  });
});

describe("classifyValueChange", () => {
  it("is null without a bought price or a reference value", () => {
    expect(classifyValueChange(null, 100)).toEqual({ kind: null, detail: null });
    expect(classifyValueChange(undefined, 100)).toEqual({ kind: null, detail: null });
    expect(classifyValueChange(50, null)).toEqual({ kind: null, detail: null });
  });

  it("is null when bought price is zero or negative (avoids division by zero)", () => {
    expect(classifyValueChange(0, 100)).toEqual({ kind: null, detail: null });
    expect(classifyValueChange(-5, 100)).toEqual({ kind: null, detail: null });
  });

  it("flags value_down for a loss of 25% or more against the purchase price", () => {
    const result = classifyValueChange(100, 74);
    expect(result.kind).toBe("value_down");
    expect(result.detail).toContain("-26%");
  });

  it("flags value_up for a gain of 25% or more against the purchase price", () => {
    const result = classifyValueChange(100, 130);
    expect(result.kind).toBe("value_up");
    expect(result.detail).toContain("+30%");
  });

  it("is null for a move within the threshold", () => {
    expect(classifyValueChange(100, 110)).toEqual({ kind: null, detail: null });
    expect(classifyValueChange(100, 90)).toEqual({ kind: null, detail: null });
  });

  it("is exactly at the boundary (25.0%) on the alerting side", () => {
    expect(classifyValueChange(100, 75).kind).toBe("value_down");
    expect(classifyValueChange(100, 125).kind).toBe("value_up");
  });

  it("respects a custom threshold", () => {
    expect(classifyValueChange(100, 110, 0.05).kind).toBe("value_up");
    expect(classifyValueChange(100, 110, 0.5).kind).toBeNull();
  });
});

// Transfer-headline classification (contact/negotiation/agreement/medical/
// official, plus source corroboration) moved to transferStage.ts and is
// tested there — findTransferHeadline/TRANSFER_KEYWORDS no longer exist.
