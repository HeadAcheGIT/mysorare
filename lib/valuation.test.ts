import { describe, it, expect } from "vitest";
import { valueFromSales, weightedMedian, listingPremiumPct, type Sale } from "./valuation";

/** "about 1 hour ago" in the export below is relative to this. */
const NOW = new Date("2026-08-15T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

/**
 * The complete Maxime Lopez 2026-27 Limited in-season sale history, as
 * exported from Sorare. Kept whole rather than trimmed because the point of
 * these tests is that the model handles the launch premium: serial 1 went for
 * 30,15 € five days ago while serial 35 went for 6,02 € an hour ago — the same
 * card, an eightfold spread, driven by drop hype rather than by the market.
 *
 * The trade at 20,14 € (serial 7, swapped rather than bought, and sold again
 * the same day at 8,33 €) is deliberately included: a robust valuation has to
 * shrug it off.
 */
const LOPEZ: Sale[] = [
  { date: hoursAgo(1), eur: 6.02, serial: 35 },
  { date: hoursAgo(4), eur: 6.33, serial: 34 },
  { date: hoursAgo(8), eur: 4.87, serial: 33 },
  { date: hoursAgo(8), eur: 6.83, serial: 29 },
  { date: hoursAgo(9), eur: 5.85, serial: 50 },
  { date: hoursAgo(17), eur: 4.38, serial: 32 },
  { date: hoursAgo(18), eur: 5.84, serial: 49 },
  { date: hoursAgo(18), eur: 4.87, serial: 30 },
  { date: hoursAgo(20), eur: 4.05, serial: 31 },
  { date: daysAgo(1), eur: 4.03, serial: 28 },
  { date: daysAgo(1), eur: 3.89, serial: 27 },
  { date: daysAgo(1), eur: 5.03, serial: 26 },
  { date: daysAgo(1), eur: 3.91, serial: 25 },
  { date: daysAgo(2), eur: 3.44, serial: 24 },
  { date: daysAgo(2), eur: 3.6, serial: 23 },
  { date: daysAgo(2), eur: 4.06, serial: 22 },
  { date: daysAgo(2), eur: 6.06, serial: 20 },
  { date: daysAgo(2), eur: 6.68, serial: 19 },
  { date: daysAgo(2), eur: 7.21, serial: 18 },
  { date: daysAgo(2), eur: 7.05, serial: 17 },
  { date: daysAgo(3), eur: 5.86, serial: 16 },
  { date: daysAgo(3), eur: 7.16, serial: 15 },
  { date: daysAgo(3), eur: 7.98, serial: 14 },
  { date: daysAgo(3), eur: 6.38, serial: 13 },
  { date: daysAgo(3), eur: 7.54, serial: 12 },
  { date: daysAgo(3), eur: 8.39, serial: 11 },
  { date: daysAgo(3), eur: 10.61, serial: 10 },
  { date: daysAgo(3), eur: 8.1, serial: 9 },
  { date: daysAgo(3), eur: 10.81, serial: 8 },
  { date: daysAgo(3), eur: 20.14, serial: 7 }, // trade, not a cash sale
  { date: daysAgo(3), eur: 8.33, serial: 7 },
  { date: daysAgo(4), eur: 11.08, serial: 6 },
  { date: daysAgo(4), eur: 11.56, serial: 5 },
  { date: daysAgo(4), eur: 13.03, serial: 4 },
  { date: daysAgo(4), eur: 18.89, serial: 3 },
  { date: daysAgo(4), eur: 19.19, serial: 2 },
  { date: daysAgo(5), eur: 30.15, serial: 1 },
];

describe("weightedMedian", () => {
  it("is null with nothing to weigh", () => {
    expect(weightedMedian([])).toBeNull();
    expect(weightedMedian([{ value: 5, weight: 0 }])).toBeNull();
  });

  it("matches the plain median at equal weights", () => {
    expect(weightedMedian([10, 20, 30].map((value) => ({ value, weight: 1 })))).toBe(20);
  });

  it("follows the heavier side", () => {
    expect(
      weightedMedian([
        { value: 10, weight: 10 },
        { value: 100, weight: 1 },
      ])
    ).toBe(10);
  });

  it("resists a single extreme value, unlike a mean", () => {
    expect(weightedMedian([8, 8, 9, 300].map((value) => ({ value, weight: 1 })))).toBeLessThan(20);
  });
});

describe("valueFromSales — the Maxime Lopez market", () => {
  const v = valueFromSales(LOPEZ, NOW);

  /** The whole point: cards are changing hands at ~5 €, not at the ~10 € a flat median returns. */
  it("values the card where it actually trades today", () => {
    expect(v.value).not.toBeNull();
    expect(v.value!).toBeGreaterThan(3.5);
    expect(v.value!).toBeLessThan(7);
  });

  it("is not dragged up by the launch prices", () => {
    // A plain median over the full history lands near 6,68 €, and a mean near
    // 8,3 € — both well above where the card trades now.
    const flatMean = LOPEZ.reduce((s, x) => s + x.eur, 0) / LOPEZ.length;
    expect(v.value!).toBeLessThan(flatMean);
  });

  it("ignores the 20,14 € trade", () => {
    expect(v.high).toBeLessThan(20.14);
  });

  it("says outright that the card is still in its launch phase", () => {
    expect(v.launchPremium).toBe(true);
  });

  it("uses a recent window rather than the whole history", () => {
    expect(v.windowDays).not.toBeNull();
    expect(v.windowDays!).toBeLessThanOrEqual(4);
    expect(v.sampleSize).toBeLessThan(v.totalSales);
  });

  it("publishes the spread and the sample so the figure can be judged", () => {
    expect(v.totalSales).toBe(LOPEZ.length);
    expect(v.low).not.toBeNull();
    expect(v.high).not.toBeNull();
    expect(v.daysSinceLast).toBe(0);
  });

  it("does not call a live market thin", () => {
    expect(v.thin).toBe(false);
  });

  it("prices the card the user bought at 4,87 € as roughly break-even", () => {
    // Not the +200% the old 14,90 € listing implied.
    const premium = listingPremiumPct(4.87, v.value);
    expect(Math.abs(premium!)).toBeLessThan(60);
  });
});

describe("valueFromSales — general behaviour", () => {
  it("reports nothing rather than guessing without sales", () => {
    const v = valueFromSales([], NOW);
    expect(v.value).toBeNull();
    expect(v.thin).toBe(true);
  });

  it("ignores nonsense prices and dates", () => {
    expect(valueFromSales([{ date: daysAgo(1), eur: 0 }, { date: "pas-une-date", eur: 10 }], NOW).sampleSize).toBe(0);
  });

  it("widens the window when recent sales are too sparse", () => {
    const sparse: Sale[] = [
      { date: daysAgo(9), eur: 10 },
      { date: daysAgo(10), eur: 11 },
      { date: daysAgo(11), eur: 9 },
      { date: daysAgo(12), eur: 10 },
      { date: daysAgo(13), eur: 10 },
    ];
    const v = valueFromSales(sparse, NOW);
    expect(v.value).toBeGreaterThan(8);
    expect(v.windowDays!).toBeGreaterThan(7);
  });

  it("weights today's trades above last week's", () => {
    const v = valueFromSales(
      [
        { date: daysAgo(0), eur: 5 },
        { date: daysAgo(0), eur: 5 },
        { date: daysAgo(0), eur: 5 },
        { date: daysAgo(6), eur: 50 },
        { date: daysAgo(6), eur: 50 },
      ],
      NOW
    );
    expect(v.value).toBe(5);
  });

  it("flags a thin sample", () => {
    expect(valueFromSales([{ date: daysAgo(1), eur: 10 }], NOW).thin).toBe(true);
  });

  it("flags a stale market even with plenty of sales", () => {
    const old = Array.from({ length: 10 }, (_, i) => ({ date: daysAgo(40 + i), eur: 10 }));
    const v = valueFromSales(old, NOW);
    expect(v.daysSinceLast!).toBeGreaterThan(21);
    expect(v.thin).toBe(true);
  });

  it("does not claim a launch premium on a steady market", () => {
    const steady = Array.from({ length: 12 }, (_, i) => ({
      date: daysAgo(i % 3),
      eur: 10,
      serial: i + 1,
    }));
    expect(valueFromSales(steady, NOW).launchPremium).toBe(false);
  });

  it("sorts by date itself, so oldest-first input is handled", () => {
    expect(valueFromSales([...LOPEZ].reverse(), NOW).value).toBe(valueFromSales(LOPEZ, NOW).value);
  });
});

describe("listingPremiumPct", () => {
  it("is null without both figures", () => {
    expect(listingPremiumPct(null, 10)).toBeNull();
    expect(listingPremiumPct(10, null)).toBeNull();
    expect(listingPremiumPct(10, 0)).toBeNull();
  });

  /** The guard that would have caught the original mistake. */
  it("shows a 14,90 € ask against a ~5 € market as a large premium", () => {
    expect(listingPremiumPct(14.9, 5)).toBeGreaterThan(100);
  });

  it("is negative when the asking price is below the market", () => {
    expect(listingPremiumPct(8, 10)).toBeLessThan(0);
  });
});
