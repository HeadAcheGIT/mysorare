import { describe, it, expect } from "vitest";
import { cardValue } from "./types";
import type { Valuation } from "./valuation";

const valuation = (value: number | null, over: Partial<Valuation> = {}): Valuation => ({
  value,
  low: null,
  high: null,
  sampleSize: 10,
  totalSales: 10,
  windowDays: 2,
  daysSinceLast: 0,
  trendPct: null,
  launchPremium: false,
  thin: false,
  ...over,
});

describe("cardValue", () => {
  it("prefers completed sales over anything the CSV carries", () => {
    // The Maxime Lopez case: an in-season card trading around 5 € showed the
    // CSV's any-season floor of 0,33 € and read as a 93 % loss.
    expect(cardValue({ valuation: valuation(5.03), price: 14.9, floorPrice: 0.33 })).toBe(5.03);
  });

  it("falls back to the CSV price when no valuation exists", () => {
    expect(cardValue({ valuation: null, price: 14.9, floorPrice: 0.33 })).toBe(14.9);
  });

  it("falls back to the CSV floor when there is no price either", () => {
    expect(cardValue({ valuation: null, price: null, floorPrice: 0.33 })).toBe(0.33);
  });

  it("returns null when nothing is known, rather than zero", () => {
    // Zero would sum into the portfolio total as a real "worth nothing"
    // rather than "not valued yet".
    expect(cardValue({ valuation: null, price: null, floorPrice: null })).toBeNull();
  });

  it("skips a valuation that found no priced sale", () => {
    // A market with no completed sales must not erase a known CSV price.
    expect(cardValue({ valuation: valuation(null), price: 14.9, floorPrice: 0.33 })).toBe(14.9);
  });

  it("still uses a thin valuation over the CSV", () => {
    // Thin is a warning the UI shows, not grounds to prefer a stale export.
    expect(cardValue({ valuation: valuation(4.2, { thin: true }), price: 14.9 })).toBe(4.2);
  });

  it("handles a card with no market fields at all", () => {
    expect(cardValue({})).toBeNull();
  });

  it("keeps a genuine zero valuation rather than falling through", () => {
    // Sorare cards do trade at rounding-error prices; 0 is an answer.
    expect(cardValue({ valuation: valuation(0), price: 14.9 })).toBe(0);
  });
});
