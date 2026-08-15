import { prisma } from "../prisma";
import { publicGraphql, CARD_OWNERSHIP_PUBLIC, PLAYERS_PER_QUERY } from "../sorare/publicClient";
import { getEthEurRate, weiToEth } from "./ethRate";

/**
 * What each owned card actually cost, from the blockchain ownership record.
 *
 * The existing sale sync reads completed *single-sale offers*, which is one of
 * several ways a card enters a gallery — an auction win, an instant buy, a
 * reward or a pack all left `boughtPrice` empty, and the season report then
 * refused to compute a net because the spend was unknown.
 *
 * `ownershipHistory` covers all of them, is public (no Sorare login), and can
 * be batched by card slug.
 */

/** Transfers that cost nothing — a price of 0 there is a fact, not a gap. */
const FREE_TRANSFERS = new Set(["REWARD", "PACK", "MINT", "REFERRAL", "SHARDS", "LOAN", "DEPOSIT", "TRANSFER"]);

type OwnershipNode = {
  from: string | null;
  transferType: string | null;
  settlementDelayReason: string | null;
  amounts: { eurCents: number | null; usdCents: number | null; wei: string | null } | null;
};

export interface Acquisition {
  cardSlug: string;
  price: number | null;
  approx: boolean;
  via: string | null;
  at: Date | null;
  paidWithCredits: boolean;
}

/**
 * The entry that put the card in this gallery: the most recent one.
 *
 * Ordering is enforced here rather than trusted from the API — an ownership
 * chain returned oldest-first would otherwise price a card at what its *first*
 * owner paid years ago.
 */
export function latestOwnership(history: OwnershipNode[]): OwnershipNode | null {
  if (!history.length) return null;
  return [...history].sort((a, b) => {
    const ta = a.from ? Date.parse(a.from) : 0;
    const tb = b.from ? Date.parse(b.from) : 0;
    return tb - ta;
  })[0];
}

/** Pure: turns one ownership entry into a price, in EUR where possible. */
export async function priceFromOwnership(
  node: OwnershipNode
): Promise<{ price: number | null; approx: boolean }> {
  const eurCents = node.amounts?.eurCents;
  if (eurCents != null) return { price: eurCents / 100, approx: false };

  // A free transfer genuinely cost nothing; saying so beats leaving a hole the
  // season report would read as "spend unknown".
  if (node.transferType && FREE_TRANSFERS.has(node.transferType)) {
    return { price: 0, approx: false };
  }

  // Priced in ETH only: convert at the rate of the day it settled rather than
  // today's, same rule as the sale history (see lib/services/ethRate.ts).
  const wei = node.amounts?.wei;
  if (wei && node.from) {
    const eth = weiToEth(wei);
    if (eth != null) {
      const rate = await getEthEurRate(new Date(node.from));
      if (rate != null) return { price: eth * rate, approx: true };
    }
  }

  return { price: null, approx: false };
}

export interface AcquisitionProgress {
  processed: number;
  priced: number;
  withCredits: number;
  nextCursor: number | null;
  total: number;
}

/**
 * Fills in acquisition details for a slice of the gallery and returns a cursor.
 * Batched by PLAYERS_PER_QUERY cards per request, so a full gallery is a
 * handful of calls rather than one per card.
 */
export async function syncAcquisitionsBatch(cursor: number, batchSize = 3): Promise<AcquisitionProgress> {
  const all = await prisma.card.findMany({ select: { slug: true }, orderBy: { slug: "asc" } });
  const slice = all.slice(cursor, cursor + batchSize * PLAYERS_PER_QUERY);

  let priced = 0;
  let withCredits = 0;

  for (let i = 0; i < slice.length; i += PLAYERS_PER_QUERY) {
    const slugs = slice.slice(i, i + PLAYERS_PER_QUERY).map((c) => c.slug);
    if (!slugs.length) continue;

    try {
      const data = await publicGraphql<{
        anyCards: { slug: string; ownershipHistory: OwnershipNode[] }[];
      }>(CARD_OWNERSHIP_PUBLIC, { slugs });

      for (const card of data.anyCards ?? []) {
        const node = latestOwnership(card.ownershipHistory ?? []);
        if (!node) continue;

        const { price, approx } = await priceFromOwnership(node);
        const paidWithCredits = node.settlementDelayReason === "CONVERSION_CREDIT_USED";
        if (price != null) priced++;
        if (paidWithCredits) withCredits++;

        // How it was acquired is always worth recording, even when a price
        // was already known.
        await prisma.card.update({
          where: { slug: card.slug },
          data: {
            acquiredVia: node.transferType ?? null,
            acquiredAt: node.from ? new Date(node.from) : null,
            paidWithCredits,
          },
        });

        // The price only fills a gap: a CSV export carries the manager's own
        // record-keeping, which beats anything inferred here.
        if (price != null) {
          await prisma.card.updateMany({
            where: { slug: card.slug, boughtPrice: null },
            data: { boughtPrice: price, boughtPriceApprox: approx },
          });
        }
      }
    } catch (err) {
      await prisma.syncLog.create({
        data: {
          job: "acquisitions",
          status: "error",
          detail: `${slugs[0]}…: ${(err as Error).message}`.slice(0, 2000),
        },
      });
    }
  }

  const nextCursor = cursor + slice.length < all.length ? cursor + slice.length : null;
  if (nextCursor === null) {
    await prisma.syncLog.create({
      data: { job: "acquisitions", status: "ok", detail: `${all.length} cartes analysées` },
    });
  }

  return { processed: slice.length, priced, withCredits, nextCursor, total: all.length };
}
