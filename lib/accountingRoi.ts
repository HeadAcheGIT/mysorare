/**
 * What a card actually cost, split between wallet and credits.
 *
 * The price of a card and the cash that left the wallet are not the same
 * number. Maxime Lopez cost 4,87 € while the ledger records only 2,44 €
 * leaving the ETH wallet: the rest was settled with Sorare credits, which never
 * move the wallet balance. That gap is invisible in either source alone —
 * `ownershipHistory` knows the price, the ledger knows the cash — and it is the
 * difference between apparent ROI and real ROI.
 *
 * Pure and free of server imports, so the arithmetic is testable on its own.
 */

/** Just enough of an accounting row to attribute it. */
export interface LedgerRow {
  cardSlug: string | null;
  entryType: string;
  /** Signed EUR movement: negative out, positive in. Null when unknown. */
  eurAmount: number | null;
}

export interface CardLedger {
  /** Cash that left for this card, refunds already deducted. */
  netPaid: number;
  /** Gross outflows before refunds — a card won on the fifth bid cost five charges. */
  paid: number;
  /** Outbid refunds returned. */
  refunded: number;
  /** Marketplace fees charged on this card. */
  fees: number;
  /** Cash received for it, when it was sold. */
  received: number;
  /** Rows that carried no EUR figure, so the totals can admit being partial. */
  unpriced: number;
}

const empty = (): CardLedger => ({
  netPaid: 0,
  paid: 0,
  refunded: 0,
  fees: 0,
  received: 0,
  unpriced: 0,
});

/**
 * Groups the ledger by card.
 *
 * Refunds are netted against purchases rather than listed apart, because a
 * card won after several bids generates a charge per bid and a refund for each
 * losing one — only the net is what it cost.
 */
export function ledgerByCard(rows: LedgerRow[]): Map<string, CardLedger> {
  const out = new Map<string, CardLedger>();

  for (const r of rows) {
    if (!r.cardSlug) continue;
    const acc = out.get(r.cardSlug) ?? empty();

    if (r.eurAmount == null) {
      acc.unpriced++;
      out.set(r.cardSlug, acc);
      continue;
    }

    const abs = Math.abs(r.eurAmount);
    if (r.entryType === "payment_fee") acc.fees += abs;
    else if (r.entryType === "cancelled_payment") acc.refunded += abs;
    else if (r.eurAmount < 0) acc.paid += abs;
    else acc.received += abs;

    acc.netPaid = acc.paid - acc.refunded;
    out.set(r.cardSlug, acc);
  }

  return out;
}

export interface PriceComposition {
  /** What the card cost, from Sorare's ownership record. */
  price: number;
  /** The part that came out of the wallet or a bank card. */
  wallet: number;
  /** The part settled with credits — the whole point of this split. */
  credit: number;
  /** Credit share, 0-100, rounded. */
  creditPct: number;
}

/**
 * Splits a known card price into wallet and credit.
 *
 * Returns null when either half is unknown, rather than guessing: showing a
 * "0 € of credit" for a card whose ledger simply hasn't been imported would be
 * a fabricated fact, and this figure exists to be trusted.
 *
 * A tolerance absorbs rounding between the export's fiat conversion and
 * Sorare's own price — a few cents of drift is not a credit payment.
 */
export function priceComposition(
  price: number | null | undefined,
  ledger: CardLedger | undefined,
  toleranceEur = 0.05
): PriceComposition | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  if (!ledger) return null;

  const wallet = Math.min(Math.max(ledger.netPaid, 0), price);
  const credit = price - wallet;

  return {
    price,
    wallet: round(wallet),
    credit: round(credit <= toleranceEur ? 0 : credit),
    creditPct: credit <= toleranceEur ? 0 : Math.round((credit / price) * 100),
  };
}

const round = (v: number) => Math.round(v * 100) / 100;

export interface LedgerTotals {
  /** Every euro that left, across the whole ledger. */
  out: number;
  /** Every euro that came in — sales and rewards alike. */
  in: number;
  net: number;
  /** Fees paid, already counted inside `out`. */
  fees: number;
  rows: number;
  /** Latest movement, so the UI can say how current the import is. */
  lastEntryAt: string | null;
}

export interface YearlyTotals {
  year: number;
  out: number;
  in: number;
  /** in - out for this calendar year alone. */
  net: number;
  /** Running total across every year up to and including this one — the
   *  figure that answers "am I up or down overall", not just this year. */
  cumulativeNet: number;
}

/**
 * Realized cash flow per calendar year, oldest first, with a running total —
 * built for the tax question ("what did I actually realize in year X") and
 * the portfolio question ("am I up overall") at once, since the second is
 * just the last row's cumulativeNet rather than a separate computation that
 * could drift from the yearly figures.
 *
 * Rows without a date are excluded — same "can't attribute it" rule as
 * `unpriced` in ledgerByCard, an unknown year must not silently land in
 * whichever year happens to sort first.
 */
export function ledgerTotalsByYear(rows: (LedgerRow & { date?: string })[]): YearlyTotals[] {
  const byYear = new Map<number, { out: number; in: number }>();

  for (const r of rows) {
    if (!r.date || r.eurAmount == null) continue;
    const year = new Date(r.date).getFullYear();
    if (Number.isNaN(year)) continue;
    const acc = byYear.get(year) ?? { out: 0, in: 0 };
    const abs = Math.abs(r.eurAmount);
    if (r.eurAmount < 0) acc.out += abs;
    else acc.in += abs;
    byYear.set(year, acc);
  }

  let cumulative = 0;
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, { out, in: inn }]) => {
      const net = round(inn - out);
      cumulative = round(cumulative + net);
      return { year, out: round(out), in: round(inn), net, cumulativeNet: cumulative };
    });
}

/** Whole-ledger totals for the history header. */
export function ledgerTotals(rows: (LedgerRow & { date?: string })[]): LedgerTotals {
  let out = 0;
  let inn = 0;
  let fees = 0;
  let lastEntryAt: string | null = null;

  for (const r of rows) {
    if (r.date && (!lastEntryAt || r.date > lastEntryAt)) lastEntryAt = r.date;
    if (r.eurAmount == null) continue;
    const abs = Math.abs(r.eurAmount);
    if (r.entryType === "payment_fee") fees += abs;
    if (r.eurAmount < 0) out += abs;
    else inn += abs;
  }

  return { out: round(out), in: round(inn), net: round(inn - out), fees: round(fees), rows: rows.length, lastEntryAt };
}
