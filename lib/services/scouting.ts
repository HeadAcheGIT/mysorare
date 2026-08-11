import { prisma } from "../prisma";
import { publicGraphql } from "../sorare/publicClient";

/**
 * Market scouting: for a given league, who is worth buying right now.
 *
 * Runs on the public API, so it needs no login. Two queries rather than one
 * because Sorare caps unauthenticated query *depth* at 7 (13 with an API key),
 * and reaching a card's sale price from a competition is ten levels deep:
 * competition → players → card → offer → side → amounts → cents. Splitting it
 * keeps both halves inside the limit.
 */

export type Money = { amount: number; currency: string } | null;

export interface ScoutPlayer {
  slug: string;
  name: string;
  position: string;
  club: string | null;
  picture: string | null;
  avgL5: number | null;
  avgL10Played: number | null;
  app15: number | null;
  injury: string | null;
  /// Floor for an in-season card of the requested rarity, if one is listed.
  floorInSeason: Money;
  /// Floor for any season — the reference against which the in-season premium reads.
  floorAnySeason: Money;
  /// Cards of this player already in your gallery, so scouting never suggests
  /// buying what you own.
  ownedCards: number;
  ownedInSeason: number;
}

export interface League {
  slug: string;
  name: string;
  country: string | null;
}

const LEAGUES_QUERY = `
query Leagues {
  football {
    leaguesOpenForGameStats { slug displayName country { code } }
  }
}`;

const LEAGUE_PLAYERS_QUERY = `
query LeaguePlayers($slug: String!, $first: Int!) {
  football {
    competition(slug: $slug) {
      displayName
      playersByLastFiveAverage(first: $first) { nodes { slug } }
    }
  }
}`;

/**
 * Depth 7 exactly: query → players → card → offer → side → amounts → cents.
 * Adding a level here will start failing without an API key.
 */
const PLAYER_MARKET_QUERY = `
query PlayerMarket($slugs: [String!]!, $rarity: Rarity!) {
  players(slugs: $slugs) {
    slug
    displayName
    anyPositions
    squaredPictureUrl
    activeClub { ... on Club { name } }
    activeInjuries { status }
    avgL5: averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE)
    avgL10Played: averageScore(type: LAST_TEN_PLAYED_SO5_AVERAGE_SCORE)
    lastFifteenSo5Appearances
    floorInSeason: lowestPriceAnyCard(rarity: $rarity, inSeason: true) {
      liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents referenceCurrency } } }
    }
    floorAnySeason: lowestPriceAnyCard(rarity: $rarity) {
      liveSingleSaleOffer { receiverSide { amounts { eurCents usdCents referenceCurrency } } }
    }
  }
}`;

type Amounts = { eurCents: number | null; usdCents: number | null; referenceCurrency: string | null };

/**
 * Sellers list in their own currency, so a listing may carry only USD cents or
 * only EUR cents. The currency is kept alongside the number rather than
 * converted — an invented exchange rate would make two prices look comparable
 * when they aren't.
 */
function toMoney(card: { liveSingleSaleOffer?: { receiverSide: { amounts: Amounts } } | null } | null): Money {
  const a = card?.liveSingleSaleOffer?.receiverSide?.amounts;
  if (!a) return null;
  if (a.eurCents != null) return { amount: a.eurCents / 100, currency: "EUR" };
  if (a.usdCents != null) return { amount: a.usdCents / 100, currency: "USD" };
  return null;
}

export async function listLeagues(): Promise<League[]> {
  const data = await publicGraphql<{
    football: { leaguesOpenForGameStats: { slug: string; displayName: string; country: { code: string } | null }[] };
  }>(LEAGUES_QUERY);

  return (data.football?.leaguesOpenForGameStats ?? [])
    .map((l) => ({ slug: l.slug, name: l.displayName, country: l.country?.code ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function scoutLeague(
  leagueSlug: string,
  rarity: string,
  limit: number
): Promise<{ league: string | null; players: ScoutPlayer[] }> {
  const list = await publicGraphql<{
    football: { competition: { displayName: string; playersByLastFiveAverage: { nodes: { slug: string }[] } } | null };
  }>(LEAGUE_PLAYERS_QUERY, { slug: leagueSlug, first: limit });

  const comp = list.football?.competition;
  const slugs = (comp?.playersByLastFiveAverage?.nodes ?? []).map((n) => n.slug);
  if (!slugs.length) return { league: comp?.displayName ?? null, players: [] };

  const market = await publicGraphql<{ players: any[] }>(PLAYER_MARKET_QUERY, { slugs, rarity });

  // What you already own, so the list can say so instead of recommending a
  // duplicate of a card sitting in your gallery. Deliberately non-fatal: the
  // prices are the point of this screen and they come from the API, so a
  // database problem should cost the ownership badges, not the whole answer.
  const owned = await prisma.card
    .findMany({
      where: { playerSlug: { in: slugs }, rarity },
      select: { playerSlug: true, inSeason: true },
    })
    .catch(() => [] as { playerSlug: string; inSeason: boolean }[]);
  const ownedBy = new Map<string, { total: number; inSeason: number }>();
  for (const c of owned) {
    const e = ownedBy.get(c.playerSlug) ?? { total: 0, inSeason: 0 };
    e.total++;
    if (c.inSeason) e.inSeason++;
    ownedBy.set(c.playerSlug, e);
  }

  const players: ScoutPlayer[] = (market.players ?? []).map((p) => {
    const o = ownedBy.get(p.slug);
    return {
      slug: p.slug,
      name: p.displayName ?? p.slug,
      position: p.anyPositions?.[0] ?? "Midfielder",
      club: p.activeClub?.name ?? null,
      picture: p.squaredPictureUrl ?? null,
      avgL5: p.avgL5 ?? null,
      avgL10Played: p.avgL10Played ?? null,
      app15: p.lastFifteenSo5Appearances ?? null,
      injury: p.activeInjuries?.[0]?.status ?? null,
      floorInSeason: toMoney(p.floorInSeason),
      floorAnySeason: toMoney(p.floorAnySeason),
      ownedCards: o?.total ?? 0,
      ownedInSeason: o?.inSeason ?? 0,
    };
  });

  // Best form first — the order you'd shop in.
  players.sort((a, b) => (b.avgL5 ?? -1) - (a.avgL5 ?? -1));
  return { league: comp?.displayName ?? null, players };
}
