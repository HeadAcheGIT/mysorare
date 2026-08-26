import { describe, it, expect } from "vitest";
import { ledgerByCard, ledgerTotals, ledgerTotalsByYear, priceComposition, type LedgerRow } from "./accountingRoi";

const row = (over: Partial<LedgerRow>): LedgerRow => ({
  cardSlug: "maxime-lopez-2026-limited-33",
  entryType: "payment",
  eurAmount: -2.44,
  ...over,
});

describe("ledgerByCard", () => {
  it("sums what left for a card", () => {
    const m = ledgerByCard([row({}), row({ eurAmount: -1.0 })]);
    expect(m.get("maxime-lopez-2026-limited-33")!.netPaid).toBeCloseTo(3.44);
  });

  it("nets outbid refunds against the charges", () => {
    // A card won on the third bid is charged three times and refunded twice;
    // only the net is what it cost.
    const m = ledgerByCard([
      row({ eurAmount: -0.9 }),
      row({ eurAmount: -1.35 }),
      row({ eurAmount: -1.95 }),
      row({ entryType: "cancelled_payment", eurAmount: 0.9 }),
      row({ entryType: "cancelled_payment", eurAmount: 1.35 }),
    ]);
    const l = m.get("maxime-lopez-2026-limited-33")!;
    expect(l.paid).toBeCloseTo(4.2);
    expect(l.refunded).toBeCloseTo(2.25);
    expect(l.netPaid).toBeCloseTo(1.95);
  });

  it("keeps fees apart from the price", () => {
    const m = ledgerByCard([row({}), row({ entryType: "payment_fee", eurAmount: -0.5 })]);
    const l = m.get("maxime-lopez-2026-limited-33")!;
    expect(l.fees).toBeCloseTo(0.5);
    expect(l.netPaid).toBeCloseTo(2.44);
  });

  it("records a sale as received, not as a negative cost", () => {
    const m = ledgerByCard([row({}), row({ eurAmount: 12 })]);
    const l = m.get("maxime-lopez-2026-limited-33")!;
    expect(l.received).toBeCloseTo(12);
    expect(l.netPaid).toBeCloseTo(2.44);
  });

  it("counts rows with no EUR figure instead of silently dropping them", () => {
    const m = ledgerByCard([row({ eurAmount: null })]);
    expect(m.get("maxime-lopez-2026-limited-33")!.unpriced).toBe(1);
  });

  it("ignores rows with no card", () => {
    expect(ledgerByCard([row({ cardSlug: null })]).size).toBe(0);
  });
});

describe("priceComposition", () => {
  it("splits the real Lopez case", () => {
    // Card cost 4,87 €; the ledger shows 2,44 € leaving the wallet.
    const ledger = ledgerByCard([row({})]).get("maxime-lopez-2026-limited-33")!;
    const c = priceComposition(4.87, ledger)!;
    expect(c.wallet).toBeCloseTo(2.44);
    expect(c.credit).toBeCloseTo(2.43);
    expect(c.creditPct).toBe(50);
  });

  it("reports no credit when the wallet covered the whole price", () => {
    const ledger = ledgerByCard([row({ eurAmount: -4.87 })]).get("maxime-lopez-2026-limited-33")!;
    const c = priceComposition(4.87, ledger)!;
    expect(c.credit).toBe(0);
    expect(c.creditPct).toBe(0);
  });

  it("treats a few cents of conversion drift as no credit", () => {
    // The export's fiat conversion and Sorare's price disagree slightly; that
    // is rounding, not a credit payment.
    const ledger = ledgerByCard([row({ eurAmount: -4.85 })]).get("maxime-lopez-2026-limited-33")!;
    expect(priceComposition(4.87, ledger)!.credit).toBe(0);
  });

  it("calls the whole price credit when no cash moved", () => {
    // A card fully settled with credits leaves no wallet trace at all.
    const ledger = ledgerByCard([row({ eurAmount: null })]).get("maxime-lopez-2026-limited-33")!;
    const c = priceComposition(4.87, ledger)!;
    expect(c.wallet).toBe(0);
    expect(c.credit).toBeCloseTo(4.87);
    expect(c.creditPct).toBe(100);
  });

  it("never reports more wallet than the card cost", () => {
    // Refunds not yet exported could otherwise produce a negative credit.
    const ledger = ledgerByCard([row({ eurAmount: -50 })]).get("maxime-lopez-2026-limited-33")!;
    const c = priceComposition(4.87, ledger)!;
    expect(c.wallet).toBeCloseTo(4.87);
    expect(c.credit).toBe(0);
  });

  it("returns null rather than inventing a split", () => {
    // No price, or no ledger for the card — both must stay unknown.
    const ledger = ledgerByCard([row({})]).get("maxime-lopez-2026-limited-33")!;
    expect(priceComposition(null, ledger)).toBeNull();
    expect(priceComposition(4.87, undefined)).toBeNull();
    expect(priceComposition(0, ledger)).toBeNull();
  });
});

describe("ledgerTotals", () => {
  it("separates money in from money out", () => {
    const t = ledgerTotals([
      { cardSlug: "a", entryType: "payment", eurAmount: -10 },
      { cardSlug: "a", entryType: "payment", eurAmount: 4 },
      { cardSlug: null, entryType: "reward", eurAmount: 3 },
    ]);
    expect(t.out).toBeCloseTo(10);
    expect(t.in).toBeCloseTo(7);
    expect(t.net).toBeCloseTo(-3);
  });

  it("counts fees inside the outflow rather than double-counting them", () => {
    const t = ledgerTotals([{ cardSlug: "a", entryType: "payment_fee", eurAmount: -2 }]);
    expect(t.fees).toBeCloseTo(2);
    expect(t.out).toBeCloseTo(2);
    expect(t.net).toBeCloseTo(-2);
  });

  it("reports the latest movement so staleness is visible", () => {
    const t = ledgerTotals([
      { cardSlug: null, entryType: "payment", eurAmount: -1, date: "2026-08-01T00:00:00.000Z" },
      { cardSlug: null, entryType: "payment", eurAmount: -1, date: "2026-08-15T00:00:00.000Z" },
    ]);
    expect(t.lastEntryAt).toBe("2026-08-15T00:00:00.000Z");
  });

  it("handles an empty ledger", () => {
    expect(ledgerTotals([])).toMatchObject({ out: 0, in: 0, net: 0, rows: 0, lastEntryAt: null });
  });
});

describe("ledgerTotalsByYear", () => {
  it("groups by calendar year, oldest first", () => {
    const years = ledgerTotalsByYear([
      { cardSlug: "a", entryType: "payment", eurAmount: -10, date: "2025-03-01T00:00:00.000Z" },
      { cardSlug: "a", entryType: "payment", eurAmount: 4, date: "2025-06-01T00:00:00.000Z" },
      { cardSlug: "b", entryType: "payment", eurAmount: 20, date: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(years.map((y) => y.year)).toEqual([2025, 2026]);
    expect(years[0]).toMatchObject({ out: 10, in: 4, net: -6 });
    expect(years[1]).toMatchObject({ out: 0, in: 20, net: 20 });
  });

  it("carries a running total across years", () => {
    const years = ledgerTotalsByYear([
      { cardSlug: "a", entryType: "payment", eurAmount: -6, date: "2025-01-01T00:00:00.000Z" },
      { cardSlug: "b", entryType: "payment", eurAmount: 20, date: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(years[0].cumulativeNet).toBeCloseTo(-6);
    expect(years[1].cumulativeNet).toBeCloseTo(14);
  });

  it("excludes rows with no date rather than guessing a year", () => {
    const years = ledgerTotalsByYear([{ cardSlug: "a", entryType: "payment", eurAmount: -6 }]);
    expect(years).toEqual([]);
  });

  it("handles an empty ledger", () => {
    expect(ledgerTotalsByYear([])).toEqual([]);
  });
});
