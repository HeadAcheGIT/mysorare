import { prisma } from "../prisma";
import { getPlayerMarket } from "./market";

/**
 * Sold/transferred cards — see the Sale model and csvImport.ts, which is
 * where these rows get created. The point of this list is a single question:
 * "was selling that a good call?" — answered by comparing what the card was
 * last valued at against what that player's floor goes for right now.
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
    const reference = r.lastKnownPrice ?? r.lastFloorPrice;
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
      detectedAt: r.detectedAt.toISOString(),
      currentFloor,
      changePct,
    });
  }
  return out;
}
