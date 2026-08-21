import { describe, it, expect } from "vitest";
import { ordinalFr, formatMoney } from "./format";

describe("ordinalFr", () => {
  it('renders 1 as "1ᵉʳ", not "1ᵉ"', () => {
    expect(ordinalFr(1)).toBe("1ᵉʳ");
  });

  it('renders every other position with "ᵉ"', () => {
    expect(ordinalFr(2)).toBe("2ᵉ");
    expect(ordinalFr(12)).toBe("12ᵉ");
    expect(ordinalFr(21)).toBe("21ᵉ");
  });
});

describe("formatMoney", () => {
  it("returns an em dash for null rather than 0", () => {
    expect(formatMoney(null)).toBe("—");
  });

  it("uses the right symbol per currency", () => {
    expect(formatMoney({ amount: 12.5, currency: "EUR" })).toBe("12.50 €");
    expect(formatMoney({ amount: 12.5, currency: "USD" })).toBe("12.50 $");
  });
});
