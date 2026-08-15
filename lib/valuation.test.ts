import { describe, it, expect } from "vitest";
import { valueFromSales, weightedMedian, listingPremiumPct, type Sale } from "./valuation";

const NOW = new Date("2026-08-13T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

/**
 * The real Maxime Lopez in-season limited market, pulled from Sorare while
 * diagnosing the bug that motivated this module. The cheapest live listing at
 * the time was 14,90 € — well above what any of these actually traded for.
 */
const LOPEZ: Sale[] = [
  { date: "2026-08-10T00:00:00Z", eur: 30.15 },
  { date: "2026-08-11T00:00:00Z", eur: 19.19 },
  { date: "2026-08-11T01:00:00Z", eur: 18.89 },
  { date: "2026-08-11T02:00:00Z", eur: 13.03 },
  { date: "2026-08-11T03:00:00Z", eur: 11.56 },
  { date: "2026-08-11T04:00:00Z", eur: 11.08 },
  { date: "2026-08-12T00:00:00Z", eur: 8.33 },
  { date: "2026-08-12T01:00:00Z", eur: 20.14 },
  { date: "2026-08-12T02:00:00Z", eur: 10.81 },
  { date: "2026-08-12T03:00:00Z", eur: 8.1 },
  { date: "2026-08-12T04:00:00Z", eur: 10.61 },
  { date: "2026-08-12T05:00:00Z", eur: 8.39 },
  { date: "2026-08-12T06:00:00Z", eur: 7.54 },
  { date: "2026-08-12T07:00:00Z", eur: 6.38 },
  { date: "2026-08-12T08:00:00Z", eur: 7.98 },
];

describe("weightedMedian", () => {
  it("is null with nothing to weigh", () => {
    expect(weightedMedian([])).toBeNull();
    expect(weightedMedian([{ value: 5, weight: 0 }])).toBeNull();
  });

  it("matches the plain median at equal weights", () => {
    const out = weightedMedian([10, 20, 30].map((value) => ({ value, weight: 1 })));
    expect(out).toBe(20);
  });

  it("follows the heavier side", () => {
    const out = weightedMedian([
      { value: 10, weight: 10 },
      { value: 100, weight: 1 },
    ]);
    expect(out).toBe(10);
  });

  it("resists a single extreme value, unlike a mean", () => {
    const out = weightedMedian([8, 8, 9, 300].map((value) => ({ value, weight: 1 })));
    expect(out).toBeLessThan(20);
  });
});

describe("valueFromSales", () => {
  it("reports nothing rather than guessing without sales", () => {
    const v = valueFromSales([], NOW);
    expect(v.value).toBeNull();
    expect(v.sampleSize).toBe(0);
    expect(v.thin).toBe(true);
  });

  it("ignores nonsense prices", () => {
    const v = valueFromSales([{ date: daysAgo(1), eur: 0 }, { date: "pas-une-date", eur: 10 }], NOW);
    expect(v.sampleSize).toBe(0);
  });

  it("values the real Lopez market well below the 14,90 € listing", () => {
    const v = valueFromSales(LOPEZ, NOW);
    expect(v.value).not.toBeNull();
    // The listing that started all this was 14,90 €.
    expect(v.value!).toBeLessThan(14.9);
    // And the day's trades clustered around 8 €.
    expect(v.value!).toBeLessThan(11);
  });

  it("publishes the spread instead of hiding it behind one number", () => {
    const v = valueFromSales(LOPEZ, NOW);
    expect(v.low).toBe(6.38);
    expect(v.high).toBe(30.15);
    expect(v.sampleSize).toBe(15);
  });

  it("sees the market falling", () => {
    const v = valueFromSales(LOPEZ, NOW);
    expect(v.trendPct).not.toBeNull();
    expect(v.trendPct!).toBeLessThan(0);
  });

  it("weights today's trades above last week's", () => {
    const sales: Sale[] = [
      { date: daysAgo(0), eur: 5 },
      { date: daysAgo(0), eur: 5 },
      { date: daysAgo(20), eur: 50 },
      { date: daysAgo(20), eur: 50 },
    ];
    expect(valueFromSales(sales, NOW).value).toBe(5);
  });

  it("flags a thin sample", () => {
    expect(valueFromSales([{ date: daysAgo(1), eur: 10 }], NOW).thin).toBe(true);
  });

  it("flags a stale market even with plenty of sales", () => {
    const old = Array.from({ length: 10 }, (_, i) => ({ date: daysAgo(40 + i), eur: 10 }));
    const v = valueFromSales(old, NOW);
    expect(v.daysSinceLast).toBeGreaterThan(21);
    expect(v.thin).toBe(true);
  });

  it("does not call a healthy recent market thin", () => {
    expect(valueFromSales(LOPEZ, NOW).thin).toBe(false);
  });

  it("sorts by date itself, so oldest-first input is handled", () => {
    const ascending = [...LOPEZ].reverse();
    expect(valueFromSales(ascending, NOW).value).toBe(valueFromSales(LOPEZ, NOW).value);
  });
});

describe("listingPremiumPct", () => {
  it("is null without both figures", () => {
    expect(listingPremiumPct(null, 10)).toBeNull();
    expect(listingPremiumPct(10, null)).toBeNull();
    expect(listingPremiumPct(10, 0)).toBeNull();
  });

  /** The check that would have caught the original mistake. */
  it("shows the 14,90 € listing was well above the real market", () => {
    expect(listingPremiumPct(14.9, 10.81)).toBeGreaterThan(30);
  });

  it("is negative when the asking price is below the market", () => {
    expect(listingPremiumPct(8, 10)).toBeLessThan(0);
  });
});
