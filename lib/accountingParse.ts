import { parseCsv, parseCardSlug } from "./services/csvParse";

/**
 * The Sorare accounting export — the real cash ledger.
 *
 * Columns: `date, entry_type, operation_type, description, currency, amount,
 * total_balance, amount_in_fiat`.
 *
 * Two things in here are easy to get wrong and were verified against the real
 * 1402-row export rather than assumed:
 *
 * 1. **The sign convention differs between two families of rows.** Rows that
 *    moved the Sorare wallet carry a running `total_balance`, and their
 *    `amount` is signed — checked with `balance_before + amount ==
 *    balance_after`, which held **827 times out of 827**. Rows with
 *    `total_balance = "-"` are external card charges and refunds; their amount
 *    is always **positive regardless of direction**, so the direction has to
 *    come from `entry_type`. Reading the sign literally on those would flip
 *    182 movements, including every 2021 auction purchase.
 *
 * 2. **`amount_in_fiat` is French-formatted** — comma decimal, non-breaking
 *    space, trailing symbol (`-2,44 €`).
 *
 * Pure and free of server imports so the rules are testable directly.
 */

/** Entry types that put money in, for rows that carry no usable sign. */
const INFLOW_TYPES = new Set(["reward", "deposit", "cancelled_payment"]);

export interface AccountingRow {
  date: string;
  entryType: string;
  operationType: string | null;
  /** Card slug when the description is one, else null. */
  cardSlug: string | null;
  description: string | null;
  currency: string | null;
  /** Signed amount as exported, in `currency`. */
  amount: number;
  /** The movement in EUR at the time, when it can be known. */
  eurAmount: number | null;
  /** True when the row moved the Sorare wallet. */
  isWallet: boolean;
  /** +1 in, -1 out. */
  direction: 1 | -1;
}

/**
 * A French-formatted money string to a number.
 *
 * Handles `-2,44 €` with a non-breaking (or narrow non-breaking) space, and
 * plain `43.41`. Returns null rather than NaN so a missing figure stays
 * visibly missing.
 */
export function parseFrenchMoney(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const cleaned = raw
    // Every space-like separator, including U+00A0 and U+202F.
    .replace(/[\s  ]/g, "")
    .replace(/[€$£]/g, "")
    .replace(",", ".")
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** A description is a card slug only when it parses as one. */
export function cardSlugFrom(description: string | null | undefined): string | null {
  const d = (description ?? "").trim();
  if (!d) return null;
  return parseCardSlug(d) ? d : null;
}

/**
 * Direction of a row.
 *
 * Wallet rows are trusted on their sign. External rows have none, so the entry
 * type decides — a `payment` charged the card, anything refund-like gave money
 * back.
 */
export function resolveDirection(entryType: string, amount: number, isWallet: boolean): 1 | -1 {
  if (isWallet) return amount < 0 ? -1 : 1;
  return INFLOW_TYPES.has(entryType) ? 1 : -1;
}

/**
 * Stable id for a row.
 *
 * The export carries no identifier, so re-importing an overlapping export
 * would otherwise double every movement. Hashing the row's own fields makes
 * the import idempotent: the same movement always lands on the same key.
 */
export function entryId(parts: (string | number | null | undefined)[]): string {
  const s = parts.map((p) => (p == null ? "" : String(p))).join("|");
  // FNV-1a, 32-bit, rendered with the length as a cheap extra discriminator.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, "0")}${s.length.toString(16)}`;
}

export interface ParsedAccounting {
  rows: AccountingRow[];
  /** Lines skipped because they carried no usable amount or date. */
  skipped: number;
}

export function parseAccountingCsv(text: string): ParsedAccounting {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], skipped: 0 };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iDate = col("date");
  const iEntry = col("entry_type");
  const iOp = col("operation_type");
  const iDesc = col("description");
  const iCur = col("currency");
  const iAmount = col("amount");
  const iBalance = col("total_balance");
  const iFiat = col("amount_in_fiat");

  if (iDate < 0 || iEntry < 0 || iAmount < 0) return { rows: [], skipped: 0 };

  const rows: AccountingRow[] = [];
  let skipped = 0;

  for (const r of table.slice(1)) {
    const rawDate = (r[iDate] ?? "").trim();
    const amount = parseFrenchMoney(r[iAmount]);
    const date = rawDate ? new Date(rawDate.replace(" UTC", "Z").replace(" ", "T")) : null;

    if (!date || Number.isNaN(date.getTime()) || amount == null) {
      skipped++;
      continue;
    }

    const entryType = (r[iEntry] ?? "").trim();
    const currency = (r[iCur] ?? "").trim() || null;
    const description = (r[iDesc] ?? "").trim() || null;

    // A running balance is what identifies a wallet movement; "-" and "" mean
    // the money never passed through the Sorare wallet.
    const isWallet = iBalance >= 0 && parseFrenchMoney(r[iBalance]) != null;
    const direction = resolveDirection(entryType, amount, isWallet);

    // EUR rows are already euros. Everything else only has the export's own
    // fiat equivalent, which is the value at the time — the right basis for a
    // cost, unlike today's rate.
    const fiat = iFiat >= 0 ? parseFrenchMoney(r[iFiat]) : null;
    const magnitude = currency === "EUR" ? Math.abs(amount) : fiat == null ? null : Math.abs(fiat);
    const eurAmount = magnitude == null ? null : magnitude * direction;

    rows.push({
      date: date.toISOString(),
      entryType,
      operationType: (r[iOp] ?? "").trim() || null,
      cardSlug: cardSlugFrom(description),
      description,
      currency,
      amount,
      eurAmount,
      isWallet,
      direction,
    });
  }

  return { rows, skipped };
}
