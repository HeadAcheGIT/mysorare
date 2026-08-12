import { describe, it, expect } from "vitest";
import { weiToEth } from "./ethRate";

describe("weiToEth", () => {
  it("is null without a value", () => {
    expect(weiToEth(null)).toBeNull();
    expect(weiToEth(undefined)).toBeNull();
    expect(weiToEth("")).toBeNull();
  });

  it("is null for an unparsable string", () => {
    expect(weiToEth("not-a-number")).toBeNull();
  });

  it("converts a realistic sale amount (0.05 ETH)", () => {
    expect(weiToEth("50000000000000000")).toBeCloseTo(0.05, 9);
  });

  it("converts a full ETH", () => {
    expect(weiToEth("1000000000000000000")).toBeCloseTo(1, 9);
  });

  it("converts a multi-ETH amount", () => {
    expect(weiToEth("2500000000000000000")).toBeCloseTo(2.5, 9);
  });
});
