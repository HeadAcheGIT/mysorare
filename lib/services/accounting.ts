import { prisma } from "../prisma";
import { entryId, parseAccountingCsv } from "../accountingParse";
import { ledgerByCard, ledgerTotals, priceComposition, type PriceComposition } from "../accountingRoi";

/**
 * The Sorare accounting export: import, and what it lets the app say.
 *
 * Imported rather than synced, and the reason is worth recording. The ledger
 * *is* reachable over the API — `currentUser.accountEntries` is a real
 * connection — but a `UserAccountEntry` exposes only `id / date / entryType /
 * amounts / account`. There is **no card reference and no operation type**,
 * so nothing in the API version can be attributed to a card. The CSV's
 * `description` column carries the card slug, and per-card attribution is the
 * whole point.
 */

export interface AccountingImportResult {
  /** Rows in the file that carried a date and an amount. */
  parsed: number;
  /** Rows written for the first time. */
  added: number;
  /** Rows already present, so a re-import costs nothing and duplicates nothing. */
  known: number;
  /** Lines with no amount — reward cards and the like, where no cash moved. */
  skipped: number;
  lastEntryAt: string | null;
}

export async function importAccountingCsv(text: string): Promise<AccountingImportResult> {
  const { rows, skipped } = parseAccountingCsv(text);

  let added = 0;
  let known = 0;

  for (const r of rows) {
    const id = entryId([r.date, r.entryType, r.operationType, r.description, r.currency, r.amount]);
    const existing = await prisma.accountingEntry.findUnique({ where: { id }, select: { id: true } });
    if (existing) {
      known++;
      continue;
    }
    await prisma.accountingEntry.create({
      data: {
        id,
        date: new Date(r.date),
        entryType: r.entryType,
        operationType: r.operationType,
        cardSlug: r.cardSlug,
        description: r.description,
        currency: r.currency,
        amount: r.amount,
        eurAmount: r.eurAmount,
        isWallet: r.isWallet,
        direction: r.direction,
      },
    });
    added++;
  }

  const last = await prisma.accountingEntry.findFirst({ orderBy: { date: "desc" }, select: { date: true } });

  await prisma.syncLog.create({
    data: {
      job: "accounting",
      status: "ok",
      detail: `${rows.length} lignes lues, ${added} ajoutées, ${known} déjà connues, ${skipped} sans montant`,
    },
  });

  return { parsed: rows.length, added, known, skipped, lastEntryAt: last?.date.toISOString() ?? null };
}

export interface AccountingSummary {
  /** Null when nothing has ever been imported. */
  lastEntryAt: string | null;
  /** When the most recent import ran — "is my export stale" needs both. */
  importedAt: string | null;
  rows: number;
  totals: { out: number; in: number; net: number; fees: number };
  /** Cards whose purchase was partly settled with credits. */
  creditCards: number;
  /** Total settled with credits, in EUR. */
  creditTotal: number;
}

export async function accountingSummary(): Promise<AccountingSummary> {
  const entries = await prisma.accountingEntry.findMany({
    select: { cardSlug: true, entryType: true, eurAmount: true, date: true, importedAt: true },
  });

  if (!entries.length) {
    return {
      lastEntryAt: null,
      importedAt: null,
      rows: 0,
      totals: { out: 0, in: 0, net: 0, fees: 0 },
      creditCards: 0,
      creditTotal: 0,
    };
  }

  const totals = ledgerTotals(entries.map((e) => ({ ...e, date: e.date.toISOString() })));
  const byCard = ledgerByCard(entries);

  // Credit shares need the real prices, which live on Card.
  const cards = await prisma.card.findMany({ select: { slug: true, boughtPrice: true } });
  let creditCards = 0;
  let creditTotal = 0;
  for (const c of cards) {
    const comp = priceComposition(c.boughtPrice, byCard.get(c.slug));
    if (comp && comp.credit > 0) {
      creditCards++;
      creditTotal += comp.credit;
    }
  }

  const importedAt = entries.reduce<Date | null>(
    (max, e) => (!max || e.importedAt > max ? e.importedAt : max),
    null
  );

  return {
    lastEntryAt: totals.lastEntryAt,
    importedAt: importedAt?.toISOString() ?? null,
    rows: totals.rows,
    totals: { out: totals.out, in: totals.in, net: totals.net, fees: totals.fees },
    creditCards,
    creditTotal: Math.round(creditTotal * 100) / 100,
  };
}

/**
 * Purchase-price composition for a set of cards, keyed by card slug.
 *
 * Reads the price from `Card` **and** from `Sale`, because the only caller is
 * the history screen and every slug it asks about is a card that has left the
 * gallery — csvImport deletes the `Card` row and records a `Sale` in its
 * place. Looking in `Card` alone therefore matched nothing at all, and the
 * wallet/credit line never rendered once.
 */
export async function compositionsFor(cardSlugs: string[]): Promise<Map<string, PriceComposition>> {
  if (!cardSlugs.length) return new Map();

  const [entries, cards, sales] = await Promise.all([
    prisma.accountingEntry.findMany({
      where: { cardSlug: { in: cardSlugs } },
      select: { cardSlug: true, entryType: true, eurAmount: true },
    }),
    prisma.card.findMany({ where: { slug: { in: cardSlugs } }, select: { slug: true, boughtPrice: true } }),
    prisma.sale.findMany({ where: { cardSlug: { in: cardSlugs } }, select: { cardSlug: true, boughtPrice: true } }),
  ]);

  // Sale first, then Card: a slug in both is a card that was sold and later
  // bought back, and the sale row is the one the history screen is showing.
  const priceBySlug = new Map<string, number | null>();
  for (const c of cards) priceBySlug.set(c.slug, c.boughtPrice);
  for (const s of sales) priceBySlug.set(s.cardSlug, s.boughtPrice);

  const byCard = ledgerByCard(entries);
  const out = new Map<string, PriceComposition>();
  for (const [slug, price] of priceBySlug) {
    const comp = priceComposition(price, byCard.get(slug));
    if (comp) out.set(slug, comp);
  }
  return out;
}
