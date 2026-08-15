/**
 * Player search and live floor price, both on the public API. Rewritten off
 * the authenticated client: the previous queries used `football.player` /
 * `football.players`, fields the current schema doesn't have (moved to root
 * `anyPlayer`/`players`/`searchPlayers`), so search and the watchlist's "Prix"
 * button both errored on every call — and required a Sorare sign-in besides,
 * which most sessions don't have.
 */
import { publicGraphql } from "../sorare/publicClient";
import { valueFromSales, type Sale, type Valuation } from "../valuation";

export interface PlayerSearchResult {
  slug: string;
  name: string;
  position: string;
  club: string | null;
  /** ISO date of birth — powers the U23 badge/sort, same as the Galerie. */
  birthDate: string | null;
  /** The club's domestic league/division, for the championship badge. */
  competitionName: string | null;
}

export interface MarketFloor {
  slug: string;
  name: string;
  /** Cheapest card of that rarity, any season — usually an old, cheap season. */
  floorByRarity: Record<string, number | null>; // eur, null = nothing currently listed
  /**
   * Cheapest *in-season* card of that rarity. This is the one that matters for
   * a card you actually field: measured on Maxime Lopez, the any-season floor
   * was 0,33 € (a 2023 card) against 14,90 € in-season — a factor of 45. Showing
   * only the former made an in-season card look worthless.
   */
  floorInSeasonByRarity: Record<string, number | null>;
  listedCount: number;
}

/**
 * `commonPlayerHits` rather than the richer `hits` field: `hits` returns
 * `ComposeTeamBenchObjectInterface`, built for Sorare's own line-up composer
 * and far heavier than a name search needs. `anyPlayer` here is the same
 * interface used everywhere else in the app.
 */
const SEARCH_QUERY = `
query SearchPlayers($query: String!, $pageSize: Int!) {
  searchPlayers(query: $query, pageSize: $pageSize) {
    commonPlayerHits {
      anyPlayer {
        slug
        displayName
        anyPositions
        activeClub { ... on Club { name domesticLeague { displayName } } }
        birthDate: birthDay
      }
    }
  }
}`;

/**
 * One field per rarity rather than a loop, since `lowestPriceAnyCard` can't
 * take a list — this is the shape Sorare's schema requires for "the floor
 * across every rarity" in a single request.
 */
const FLOOR_QUERY = `
query PlayerFloor($slug: String!) {
  anyPlayer(slug: $slug) {
    slug
    displayName
    common: lowestPriceAnyCard(rarity: common) { liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents } } } }
    commonIS: lowestPriceAnyCard(rarity: common, inSeason: true) { liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents } } } }
    limited: lowestPriceAnyCard(rarity: limited) { liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents } } } }
    limitedIS: lowestPriceAnyCard(rarity: limited, inSeason: true) { liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents } } } }
    rare: lowestPriceAnyCard(rarity: rare) { liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents } } } }
    rareIS: lowestPriceAnyCard(rarity: rare, inSeason: true) { liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents } } } }
    super_rare: lowestPriceAnyCard(rarity: super_rare) { liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents } } } }
    super_rareIS: lowestPriceAnyCard(rarity: super_rare, inSeason: true) { liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents } } } }
    unique: lowestPriceAnyCard(rarity: unique) { liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents } } } }
    uniqueIS: lowestPriceAnyCard(rarity: unique, inSeason: true) { liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents } } } }
  }
}`;

type RarityCard = { liveSingleSaleOffer: { receiverSide: { amounts: { eurCents: number | null; usdCents: number | null } } } | null } | null;

function eur(card: RarityCard): number | null {
  const a = card?.liveSingleSaleOffer?.receiverSide?.amounts;
  if (!a) return null;
  // Floor is compared across rarities in the same currency, so a USD-only
  // listing is dropped here rather than mixed in unconverted — the watchlist
  // trusts this number to mean euros.
  return a.eurCents != null ? a.eurCents / 100 : null;
}

export async function searchPlayers(query: string): Promise<PlayerSearchResult[]> {
  const data = await publicGraphql<{
    searchPlayers: { commonPlayerHits: { anyPlayer: any }[] };
  }>(SEARCH_QUERY, { query, pageSize: 8 });

  return (data.searchPlayers?.commonPlayerHits ?? [])
    .map((h) => h.anyPlayer)
    .filter(Boolean)
    .map((p) => ({
      slug: p.slug,
      name: p.displayName ?? p.slug,
      position: p.anyPositions?.[0] ?? "Midfielder",
      club: p.activeClub?.name ?? null,
      birthDate: p.birthDate ?? null,
      competitionName: p.activeClub?.domesticLeague?.displayName ?? null,
    }));
}

/**
 * Completed in-season sales for one player and rarity, valued.
 *
 * Separate from the floor on purpose: the floor is what someone is *asking*,
 * this is what cards have actually *fetched*. On Maxime Lopez the two differed
 * by 38%, with the listing the higher of the pair — see lib/valuation.ts.
 */
const SALES_QUERY = `
query PlayerSales($slug: String!, $rarity: Rarity!) {
  anyPlayer(slug: $slug) {
    tokenPrices(rarity: $rarity, seasonEligibility: IN_SEASON, first: 50) {
      nodes {
        date
        amounts { eurCents }
        # The serial is what reveals a launch premium: Sorare releases serials
        # in order, and a new season's first ones are bid up by drop hype.
        card { serialNumber }
      }
    }
  }
}`;

export async function getPlayerValuation(slug: string, rarity: string): Promise<Valuation> {
  const data = await publicGraphql<{
    anyPlayer: {
      tokenPrices: {
        nodes: {
          date: string;
          amounts: { eurCents: number | null };
          card: { serialNumber: number | null } | null;
        }[];
      };
    } | null;
  }>(SALES_QUERY, { slug, rarity });

  const sales: Sale[] = (data.anyPlayer?.tokenPrices?.nodes ?? [])
    // EUR only: mixing a USD figure in would shift the median by an invented
    // exchange rate rather than by the market.
    .filter((n) => n.amounts?.eurCents != null)
    .map((n) => ({
      date: n.date,
      eur: (n.amounts.eurCents as number) / 100,
      serial: n.card?.serialNumber ?? null,
    }));

  return valueFromSales(sales);
}

export async function getPlayerMarket(slug: string): Promise<MarketFloor> {
  const data = await publicGraphql<{ anyPlayer: any }>(FLOOR_QUERY, { slug });
  const p = data.anyPlayer;

  const floorByRarity: Record<string, number | null> = {
    common: eur(p?.common),
    limited: eur(p?.limited),
    rare: eur(p?.rare),
    super_rare: eur(p?.super_rare),
    unique: eur(p?.unique),
  };
  const floorInSeasonByRarity: Record<string, number | null> = {
    common: eur(p?.commonIS),
    limited: eur(p?.limitedIS),
    rare: eur(p?.rareIS),
    super_rare: eur(p?.super_rareIS),
    unique: eur(p?.uniqueIS),
  };
  // Counted across both so a player listed only in-season still reads as listed.
  const listedCount = Object.keys(floorByRarity).filter(
    (r) => floorByRarity[r] != null || floorInSeasonByRarity[r] != null
  ).length;

  return { slug, name: p?.displayName ?? slug, floorByRarity, floorInSeasonByRarity, listedCount };
}
