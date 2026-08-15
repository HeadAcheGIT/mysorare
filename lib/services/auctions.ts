import { config } from "../config";
import { prisma } from "../prisma";
import { publicGraphql, LIVE_AUCTIONS_PUBLIC } from "../sorare/publicClient";
import { getEthEurRate, weiToEth } from "./ethRate";
import { getPlayerValuation } from "./market";
import { assessAuction, rankAuctions, type AuctionOpportunity } from "../auctionWatch";
import type { Valuation } from "../valuation";

/**
 * Live auctions on the players you're watching.
 *
 * Sorare's feed has no per-player filter, so this scans the most recently
 * updated auctions and keeps the ones matching the watchlist. Bounded on
 * purpose: the feed covers every football auction of the last ten days, and
 * walking it whole would spend the public API's budget to find a handful of
 * rows.
 *
 * An auction is only worth surfacing next to a number that says whether the
 * current bid is cheap, so each match is priced against what those cards
 * actually trade at (lib/valuation.ts) rather than shown as a bare figure.
 */

/**
 * How much of the feed gets scanned, which depends entirely on whether a
 * Sorare API key is configured.
 *
 * Measured against the live API: this query costs ~33 complexity per auction,
 * so 15 per page is the most that fits the unauthenticated cap of 500, and the
 * rate limit of 20 requests/minute makes each page cost ~3 s. With an API key
 * the cap is 30000 and the limit 600/minute, so pages get bigger and there can
 * be far more of them.
 *
 * The result reports `scanned` and `truncated` either way — partial coverage
 * of a global feed has to be visible, not implied.
 */
const withKey = () => Boolean(config.sorareApiKey);
const pageSize = () => (withKey() ? 50 : 15);
const maxPages = () => (withKey() ? 20 : 6);
/** Valuations cost one paced request each, so only the first matches get one. */
const MAX_VALUATIONS = 12;

type AuctionNode = {
  open: boolean;
  endDate: string;
  bidsCount: number;
  currency: string;
  currentPrice: string;
  bestBid: { amounts: { eurCents: number | null } | null } | null;
  anyCards: {
    slug: string;
    rarityTyped: string | null;
    seasonYear: number | null;
    inSeasonEligible: boolean | null;
    serialNumber: number | null;
    anyPlayer: { slug: string; displayName: string | null } | null;
  }[];
};

export interface WatchedAuction {
  cardSlug: string;
  playerSlug: string;
  playerName: string;
  rarity: string | null;
  seasonYear: number | null;
  inSeason: boolean;
  serialNumber: number | null;
  endDate: string;
  bidsCount: number;
  /** Current bid in EUR. Null when it couldn't be converted. */
  currentEur: number | null;
  /** True when the figure came from converting wei rather than a EUR amount Sorare gave. */
  currentApprox: boolean;
  valuation: Valuation | null;
  opportunity: AuctionOpportunity;
}

export interface AuctionWatchResult {
  auctions: WatchedAuction[];
  /** Players on the watchlist, so an empty result can say "none up for auction" rather than "nothing watched". */
  watchedCount: number;
  /** Auctions examined — makes the bounded scan visible instead of implying exhaustiveness. */
  scanned: number;
  /** True when the scan stopped at its page limit, so more may exist further down the feed. */
  truncated: boolean;
}

/**
 * Current bid in EUR.
 *
 * `bestBid.amounts.eurCents` is Sorare's own figure and is used whenever a bid
 * exists. With no bids there is only the wei starting price, converted at
 * today's rate and flagged approximate — a converted figure must not read as
 * an exact one.
 */
async function currentPriceEur(node: AuctionNode): Promise<{ eur: number | null; approx: boolean }> {
  const cents = node.bestBid?.amounts?.eurCents;
  if (cents != null) return { eur: cents / 100, approx: false };

  const eth = weiToEth(node.currentPrice);
  if (eth == null) return { eur: null, approx: false };

  const rate = await getEthEurRate(new Date());
  if (rate == null) return { eur: null, approx: false };
  return { eur: eth * rate, approx: true };
}

export async function watchedAuctions(): Promise<AuctionWatchResult> {
  const items = await prisma.watchlistItem.findMany({ select: { playerSlug: true } });
  const watched = new Set(items.map((i) => i.playerSlug));

  if (!watched.size) {
    return { auctions: [], watchedCount: 0, scanned: 0, truncated: false };
  }

  const matches: { node: AuctionNode; card: AuctionNode["anyCards"][number] }[] = [];
  let cursor: string | null = null;
  let scanned = 0;
  let truncated = false;

  const PAGES = maxPages();
  const SIZE = pageSize();

  for (let page = 0; page < PAGES; page++) {
    const data: {
      tokens: {
        liveAuctions: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: AuctionNode[] };
      };
    } = await publicGraphql(LIVE_AUCTIONS_PUBLIC, { first: SIZE, after: cursor });

    const conn = data?.tokens?.liveAuctions;
    const nodes = conn?.nodes ?? [];
    scanned += nodes.length;

    for (const node of nodes) {
      if (!node.open) continue;
      // A bundle can hold several cards; each is a separate opportunity.
      for (const card of node.anyCards ?? []) {
        if (card.anyPlayer?.slug && watched.has(card.anyPlayer.slug)) matches.push({ node, card });
      }
    }

    if (!conn?.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
    if (page === PAGES - 1) truncated = true;
  }

  // One valuation per player+rarity, not per auction — several serials of the
  // same card are routinely up at once, and each would otherwise cost its own
  // paced request.
  const valuations = new Map<string, Valuation | null>();
  const wanted = matches.slice(0, MAX_VALUATIONS);
  for (const { card } of wanted) {
    const key = `${card.anyPlayer!.slug}:${card.rarityTyped ?? "limited"}`;
    if (valuations.has(key)) continue;
    valuations.set(
      key,
      // Non-fatal: an auction without a valuation is still worth showing, it
      // just can't be judged.
      await getPlayerValuation(card.anyPlayer!.slug, card.rarityTyped ?? "limited").catch(() => null)
    );
  }

  const now = new Date();
  const auctions: WatchedAuction[] = [];
  for (const { node, card } of matches) {
    const { eur, approx } = await currentPriceEur(node);
    const key = `${card.anyPlayer!.slug}:${card.rarityTyped ?? "limited"}`;
    const valuation = valuations.get(key) ?? null;

    auctions.push({
      cardSlug: card.slug,
      playerSlug: card.anyPlayer!.slug,
      playerName: card.anyPlayer!.displayName ?? card.anyPlayer!.slug,
      rarity: card.rarityTyped,
      seasonYear: card.seasonYear,
      inSeason: Boolean(card.inSeasonEligible),
      serialNumber: card.serialNumber,
      endDate: node.endDate,
      bidsCount: node.bidsCount,
      currentEur: eur,
      currentApprox: approx,
      valuation,
      opportunity: assessAuction(
        { currentEur: eur, valuationEur: valuation?.value ?? null, endDate: node.endDate },
        now
      ),
    });
  }

  return { auctions: rankAuctions(auctions), watchedCount: watched.size, scanned, truncated };
}
