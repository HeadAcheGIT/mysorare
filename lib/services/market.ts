/**
 * Player search and live floor price, both on the public API. Rewritten off
 * the authenticated client: the previous queries used `football.player` /
 * `football.players`, fields the current schema doesn't have (moved to root
 * `anyPlayer`/`players`/`searchPlayers`), so search and the watchlist's "Prix"
 * button both errored on every call — and required a Sorare sign-in besides,
 * which most sessions don't have.
 */
import { publicGraphql } from "../sorare/publicClient";
import { ALL_RARITIES, TRACKED_RARITIES } from "../types";
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
 * take a list — this is the shape Sorare's schema requires for several floors
 * in a single request.
 *
 * Built from the rarities asked for rather than fixed at all five: each one
 * costs a pair of sub-queries (any-season and in-season), so a caller that
 * needs a single rarity — which is every caller that already knows the card
 * it's pricing — spends four sub-queries where it used to spend ten.
 *
 * The rarity goes in as a GraphQL enum literal and so can't be a variable;
 * it's whitelisted against `ALL_RARITIES` instead, because these values reach
 * here from query strings and database rows.
 */
const OFFER = `{ liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents } } } }`;

function floorQuery(rarities: readonly string[]): string {
  const fields = rarities
    .map(
      (r) =>
        `    ${r}: lowestPriceAnyCard(rarity: ${r}) ${OFFER}\n` +
        `    ${r}IS: lowestPriceAnyCard(rarity: ${r}, inSeason: true) ${OFFER}`
    )
    .join("\n");

  return `
query PlayerFloor($slug: String!) {
  anyPlayer(slug: $slug) {
    slug
    displayName
${fields}
  }
}`;
}

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
query PlayerSales($slug: String!, $rarity: Rarity!, $eligibility: SeasonEligibility!) {
  anyPlayer(slug: $slug) {
    # "last", not "first": this connection is ordered oldest-first, so "first"
    # pins the window to the season's opening sales — exactly the launch
    # premium the valuation exists to discount. It looks correct while a season
    # is young enough that every sale fits in one page, then quietly stops
    # tracking the market for any player who trades more than 50 times.
    tokenPrices(rarity: $rarity, seasonEligibility: $eligibility, last: 50) {
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

/**
 * What cards of this player and rarity actually fetch.
 *
 * `inSeason` picks which market is being asked about, and the two are not
 * interchangeable: on Maxime Lopez the in-season limited traded around 5 €
 * while an older season went for 0,33 €. Valuing a classic card off in-season
 * sales — which is what this did before — overstates it by that whole factor.
 */
export async function getPlayerValuation(
  slug: string,
  rarity: string,
  inSeason = true
): Promise<Valuation> {
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
  }>(SALES_QUERY, { slug, rarity, eligibility: inSeason ? "IN_SEASON" : "CLASSIC" });

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

/**
 * Floors for one player.
 *
 * `rarities` defaults to the ones actually played (`TRACKED_RARITIES`). A
 * caller holding a specific card should pass just that card's rarity: it keeps
 * the answer correct for a rarity outside the default while costing the least
 * possible.
 */
export async function getPlayerMarket(
  slug: string,
  rarities: readonly string[] = TRACKED_RARITIES
): Promise<MarketFloor> {
  // Whitelisted because these values arrive from query strings and DB rows,
  // and they are interpolated into the document as enum literals.
  const wanted = rarities.filter((r): r is (typeof ALL_RARITIES)[number] =>
    (ALL_RARITIES as readonly string[]).includes(r)
  );
  if (!wanted.length) {
    return { slug, name: slug, floorByRarity: {}, floorInSeasonByRarity: {}, listedCount: 0 };
  }

  const data = await publicGraphql<{ anyPlayer: any }>(floorQuery(wanted), { slug });
  const p = data.anyPlayer;

  const floorByRarity: Record<string, number | null> = {};
  const floorInSeasonByRarity: Record<string, number | null> = {};
  for (const r of wanted) {
    floorByRarity[r] = eur(p?.[r]);
    floorInSeasonByRarity[r] = eur(p?.[`${r}IS`]);
  }
  // Counted across both so a player listed only in-season still reads as listed.
  const listedCount = Object.keys(floorByRarity).filter(
    (r) => floorByRarity[r] != null || floorInSeasonByRarity[r] != null
  ).length;

  return { slug, name: p?.displayName ?? slug, floorByRarity, floorInSeasonByRarity, listedCount };
}
