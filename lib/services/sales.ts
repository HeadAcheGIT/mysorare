import { prisma } from "../prisma";
import { getPlayerMarket } from "./market";
import { paginate } from "../sorare/client";
import { SOLD_SINGLE_SALE_OFFERS, BOUGHT_SINGLE_SALE_OFFERS } from "../sorare/queries";
import { parseCardSlug } from "./csvParse";

/**
 * Sold/transferred cards — see the Sale model and csvImport.ts, which is
 * where these rows get created. The point of this list is a single question:
 * "was selling that a good call?" — answered by comparing what the card was
 * last valued at against what that player's floor goes for right now.
 *
 * Two sources feed the Sale table:
 *  - csvImport.ts, on every import, for any card that vanished since the
 *    last one — an inference (source: "csv_diff"), with only a pre-sale
 *    valuation to go on, never a confirmed price.
 *  - syncSoldOffersFromSorare below, on demand, from Sorare's own completed
 *    single-sale-offer record — the real transaction (source: "sorare_sync"),
 *    confirmed price and date. Requires being signed in to Sorare in-app.
 *    Backfills the *entire* history in one pass, not just what happens after
 *    the sync first runs, which is what csv_diff alone can never do.
 */

export interface SaleRow {
  cardSlug: string;
  playerSlug: string;
  playerName: string;
  rarity: string;
  season: number | null;
  serialNumber: number | null;
  boughtPrice: number | null;
  lastKnownPrice: number | null;
  lastFloorPrice: number | null;
  lastEstimatedPrice: number | null;
  /// Confirmed sale price/date from Sorare's own record, when synced — see
  /// syncSoldOffersFromSorare. Null until a sync has picked up this card.
  soldPrice: number | null;
  soldAt: string | null;
  source: string;
  detectedAt: string;
  /// Today's floor for this player/rarity, fetched live — null if nothing is
  /// currently listed or the lookup failed.
  currentFloor: number | null;
  /// % change of currentFloor vs lastKnownPrice (or lastFloorPrice as a
  /// fallback when the card wasn't listed when it vanished). Null without
  /// enough data to compare — never invented.
  changePct: number | null;
}

/** Pure: % move of the current floor vs. the reference price — null without enough data to compare. */
export function computeChangePct(
  reference: number | null | undefined,
  currentFloor: number | null | undefined
): number | null {
  if (currentFloor == null || reference == null || reference <= 0) return null;
  return ((currentFloor - reference) / reference) * 100;
}

export async function listSales(limit = 100, budgetMs = 40_000): Promise<SaleRow[]> {
  const rows = await prisma.sale.findMany({ orderBy: { detectedAt: "desc" }, take: limit });

  // One live lookup per (player, rarity) rather than per row — several sales
  // of the same player/rarity combo share a floor, and the public API is
  // paced at one call at a time (see publicClient.ts), so de-duplicating is
  // what keeps this from timing out on a long history.
  const started = Date.now();
  const floorCache = new Map<string, number | null>();
  async function floorFor(playerSlug: string, rarity: string): Promise<number | null> {
    const key = `${playerSlug}:${rarity}`;
    if (floorCache.has(key)) return floorCache.get(key)!;
    if (Date.now() - started > budgetMs) return null; // out of time — leave unverified rather than block the response
    let floor: number | null = null;
    try {
      const market = await getPlayerMarket(playerSlug);
      floor = market.floorByRarity[rarity] ?? null;
    } catch {
      // Live lookup is a nice-to-have here; the historical record still matters without it.
    }
    floorCache.set(key, floor);
    return floor;
  }

  const out: SaleRow[] = [];
  for (const r of rows) {
    const currentFloor = await floorFor(r.playerSlug, r.rarity);
    // The confirmed Sorare price is the real thing; the CSV valuation is only
    // ever a fallback for cards no sync has reached yet.
    const reference = r.soldPrice ?? r.lastKnownPrice ?? r.lastFloorPrice;
    const changePct = computeChangePct(reference, currentFloor);

    out.push({
      cardSlug: r.cardSlug,
      playerSlug: r.playerSlug,
      playerName: r.playerName,
      rarity: r.rarity,
      season: r.season,
      serialNumber: r.serialNumber,
      boughtPrice: r.boughtPrice,
      lastKnownPrice: r.lastKnownPrice,
      lastFloorPrice: r.lastFloorPrice,
      lastEstimatedPrice: r.lastEstimatedPrice,
      soldPrice: r.soldPrice,
      soldAt: r.soldAt?.toISOString() ?? null,
      source: r.source,
      detectedAt: r.detectedAt.toISOString(),
      currentFloor,
      changePct,
    });
  }
  // Sale.detectedAt is "when the CSV diff noticed", which can lag the real
  // transaction by weeks — once a confirmed soldAt exists, that's the truer
  // "newest first" ordering.
  out.sort((a, b) => new Date(b.soldAt ?? b.detectedAt).getTime() - new Date(a.soldAt ?? a.detectedAt).getTime());
  return out;
}

type OfferAnyCard = { slug: string; anyPlayer?: { slug: string; displayName: string } };
type OfferSide<T> = { anyCards?: T[]; amounts?: { eurCents: number | null; usdCents: number | null } | null };
type SoldOfferNode = {
  transactionDate: string | null;
  endDate: string | null;
  senderSide: OfferSide<OfferAnyCard>;
  receiverSide: OfferSide<never>;
};
type BoughtOfferNode = {
  senderSide: OfferSide<{ slug: string }>;
  receiverSide: OfferSide<never>;
};

function eur(amounts: { eurCents: number | null } | null | undefined): number | null {
  return amounts?.eurCents != null ? amounts.eurCents / 100 : null;
}

export interface SyncProgress {
  sold: number;
  boughtMatched: number;
}

/**
 * Pulls the complete sold-offer history from Sorare and upserts it into
 * Sale, then does a best-effort pass over bought offers to fill boughtPrice
 * for rows the CSV never had a price for. User-triggered only (see
 * app/api/sales/sync/route.ts) — like every other authenticated call in this
 * app, never run automatically, since a stale/missing Sorare session
 * shouldn't take anything else down with it (see lib/sorare/auth.ts).
 */
export async function syncSoldOffersFromSorare(budgetMs = 45_000): Promise<SyncProgress> {
  const started = Date.now();
  let sold = 0;

  for await (const node of paginate<SoldOfferNode>(
    SOLD_SINGLE_SALE_OFFERS,
    {},
    ["currentUser", "soldSingleSaleTokenOffers"]
  )) {
    if (Date.now() - started > budgetMs) break;
    const card = node.senderSide?.anyCards?.[0];
    if (!card) continue;
    const parsed = parseCardSlug(card.slug);
    if (!parsed) continue;
    const price = eur(node.receiverSide?.amounts);
    const at = node.transactionDate ?? node.endDate;

    await prisma.sale.upsert({
      where: { cardSlug: card.slug },
      create: {
        cardSlug: card.slug,
        playerSlug: parsed.playerSlug,
        playerName: card.anyPlayer?.displayName ?? parsed.playerSlug,
        rarity: parsed.rarity,
        season: parsed.season,
        serialNumber: parsed.serialNumber,
        soldPrice: price,
        soldAt: at ? new Date(at) : null,
        source: "sorare_sync",
      },
      // A card already recorded via csv_diff gets upgraded to the confirmed
      // number; one already sorare_sync'd just gets refreshed.
      update: { soldPrice: price, soldAt: at ? new Date(at) : null, source: "sorare_sync" },
    });
    sold++;
  }

  let boughtMatched = 0;
  for await (const node of paginate<BoughtOfferNode>(
    BOUGHT_SINGLE_SALE_OFFERS,
    {},
    ["currentUser", "boughtSingleSaleTokenOffers"]
  )) {
    if (Date.now() - started > budgetMs) break;
    const card = node.senderSide?.anyCards?.[0];
    if (!card) continue;
    const price = eur(node.receiverSide?.amounts);
    if (price == null) continue;

    // Only fills a gap — never overwrites a price the CSV already carried,
    // since that one came with the manager's own record-keeping behind it.
    const { count } = await prisma.sale.updateMany({
      where: { cardSlug: card.slug, boughtPrice: null },
      data: { boughtPrice: price },
    });
    boughtMatched += count;
  }

  return { sold, boughtMatched };
}
