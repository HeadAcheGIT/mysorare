import { prisma } from "../prisma";
import { valueFromSales, type Sale, type Valuation } from "../valuation";
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

export interface SaleTrend {
  /// Completed sales (auctions and direct offers alike), newest first, in
  /// whatever currency each seller priced in.
  sales: { date: string; money: Money }[];
  lastSale: Money;
  lastSaleDate: string | null;
  /// % change: average of the most recent sales vs the batch before them.
  /// Positive means the price is climbing. Null without enough sales to compare.
  trendPct: number | null;
}

export interface ScoutPlayer {
  slug: string;
  name: string;
  position: string;
  club: string | null;
  picture: string | null;
  /** ISO date of birth — powers the U23 badge/sort, same as the Galerie. */
  birthDate: string | null;
  avgL5: number | null;
  avgL10Played: number | null;
  app15: number | null;
  injury: string | null;
  /// Floor for an in-season card of the requested rarity, if one is listed
  /// for immediate purchase right now — a snapshot, not a trend.
  floorInSeason: Money;
  /// Floor for any season — the reference against which the in-season premium reads.
  floorAnySeason: Money;
  /// What the in-season card has actually sold for recently. This is what
  /// answers "is the price going up or down", which a live listing can't.
  inSeasonTrend: SaleTrend | null;
  /// What the card actually trades at, from completed sales — the figure the
  /// ranking uses. `inSeasonTrend.lastSale` is a single transaction and far
  /// too noisy to price on: consecutive Maxime Lopez sales ran 6,38 €, then
  /// 20,14 €, then 8,33 €.
  valuation: Valuation | null;
  /// Cards of this player already in your gallery, so scouting never suggests
  /// buying what you own.
  ownedCards: number;
  ownedInSeason: number;
  /// ISO date of his most recent game. Null until the per-player pass has run.
  /// Without it, a form average from before a three-month break reads as
  /// current — which is exactly how you buy a player who hasn't kicked a ball
  /// since May.
  lastPlayedAt: string | null;
  /// The club he played that last game for. When it differs from `club`, the
  /// form and appearance figures describe his previous team, not this one.
  clubAtLastGame: { slug: string; name: string } | null;
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
    birthDate: birthDay
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
function toMoneyFromAmounts(a: Amounts | null | undefined): Money {
  if (!a) return null;
  if (a.eurCents != null) return { amount: a.eurCents / 100, currency: "EUR" };
  if (a.usdCents != null) return { amount: a.usdCents / 100, currency: "USD" };
  return null;
}

function toMoney(card: { liveSingleSaleOffer?: { receiverSide: { amounts: Amounts } } | null } | null): Money {
  return toMoneyFromAmounts(card?.liveSingleSaleOffer?.receiverSide?.amounts);
}

/**
 * Completed sales, not live listings. `anyPlayer(slug)` is the only shape
 * Sorare accepts `tokenPrices` on — selecting it within the `players(slugs)`
 * list is explicitly rejected — so this is one request per player and can't
 * be batched like the rest of the scouting query.
 */
const PLAYER_SALES_QUERY = `
query PlayerSales($slug: String!, $rarity: Rarity!) {
  anyPlayer(slug: $slug) {
    # "last", not "first": the connection is ordered oldest-first, so "first"
    # returns the season's opening sales — precisely the launch-premium window
    # the valuation exists to discount. Harmless while a season is young and
    # under 50 sales fit, silently wrong for every liquid player after that.
    tokenPrices(rarity: $rarity, seasonEligibility: IN_SEASON, last: 50) {
      # serialNumber reveals a launch premium — see lib/valuation.ts.
      nodes { date amounts { eurCents usdCents referenceCurrency } card { serialNumber } }
    }
    # Rides along on a request that was being made anyway, so both of these
    # cost nothing extra. They answer the two questions a form average can't:
    # is it recent, and is it even about the club shown? A player whose last
    # game was three months ago, or who has since transferred, has stats that
    # describe a different situation entirely.
    anyPastGames(first: 1) {
      nodes {
        date
        playerGameScore(playerSlug: $slug) {
          anyPlayerGameStats {
            ... on PlayerGameStats { anyTeam { ... on Club { slug name } } }
          }
        }
      }
    }
  }
}`;

export interface PlayerContext {
  trend: SaleTrend | null;
  /**
   * What the card actually trades at, from completed sales — see
   * lib/valuation.ts. Distinct from `trend.lastSale`, which is a single
   * transaction and therefore the noisiest number on the screen: on Maxime
   * Lopez consecutive sales ran 6,38 € then 20,14 € then 8,33 €.
   */
  valuation: Valuation | null;
  /** ISO date of the player's most recent game, whatever club it was for. */
  lastPlayedAt: string | null;
  /** The club he actually played that game for — not necessarily his current one. */
  clubAtLastGame: { slug: string; name: string } | null;
}

async function getPlayerContext(slug: string, rarity: string): Promise<PlayerContext> {
  const data = await publicGraphql<{
    anyPlayer: {
      tokenPrices: {
        nodes: { date: string; amounts: Amounts; card: { serialNumber: number | null } | null }[];
      };
      anyPastGames: {
        nodes: {
          date: string;
          playerGameScore: { anyPlayerGameStats: { anyTeam: { slug: string; name: string } | null } | null } | null;
        }[];
      } | null;
    } | null;
  }>(PLAYER_SALES_QUERY, { slug, rarity });

  const lastGame = data.anyPlayer?.anyPastGames?.nodes?.[0] ?? null;
  const team = lastGame?.playerGameScore?.anyPlayerGameStats?.anyTeam ?? null;

  const sales: Sale[] = (data.anyPlayer?.tokenPrices?.nodes ?? [])
    // EUR only — a USD figure would need an invented rate to compare.
    .filter((n) => n.amounts?.eurCents != null)
    .map((n) => ({
      date: n.date,
      eur: (n.amounts.eurCents as number) / 100,
      serial: n.card?.serialNumber ?? null,
    }));

  return {
    trend: buildTrend(data),
    valuation: sales.length ? valueFromSales(sales) : null,
    lastPlayedAt: lastGame?.date ?? null,
    clubAtLastGame: team ? { slug: team.slug, name: team.name } : null,
  };
}

function buildTrend(data: {
  anyPlayer: { tokenPrices: { nodes: { date: string; amounts: Amounts }[] } } | null;
}): SaleTrend | null {

  // API returns oldest-first; newest-first reads better and matches every
  // other "recent" list in the app.
  const nodes = [...(data.anyPlayer?.tokenPrices?.nodes ?? [])].reverse();
  if (!nodes.length) return { sales: [], lastSale: null, lastSaleDate: null, trendPct: null };

  const sales = nodes.map((n) => ({ date: n.date, money: toMoneyFromAmounts(n.amounts) }));

  // Trend needs same-currency comparisons — mixing a EUR half with a USD half
  // would read as a price move that's actually just a currency split.
  const eur = nodes.map((n) => n.amounts.eurCents).filter((c): c is number => c != null);
  let trendPct: number | null = null;
  if (eur.length >= 4) {
    const half = Math.floor(eur.length / 2);
    const recent = eur.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const older = eur.slice(half).reduce((a, b) => a + b, 0) / (eur.length - half);
    if (older > 0) trendPct = ((recent - older) / older) * 100;
  }

  return { sales, lastSale: sales[0]?.money ?? null, lastSaleDate: sales[0]?.date ?? null, trendPct };
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
  limit: number,
  enrich = true
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
      birthDate: p.birthDate ?? null,
      avgL5: p.avgL5 ?? null,
      avgL10Played: p.avgL10Played ?? null,
      app15: p.lastFifteenSo5Appearances ?? null,
      injury: p.activeInjuries?.[0]?.status ?? null,
      floorInSeason: toMoney(p.floorInSeason),
      floorAnySeason: toMoney(p.floorAnySeason),
      inSeasonTrend: null,
      valuation: null,
      ownedCards: o?.total ?? 0,
      ownedInSeason: o?.inSeason ?? 0,
      lastPlayedAt: null,
      clubAtLastGame: null,
    };
  });

  // Best form first — the order you'd shop in, and the order the per-player
  // pass runs in, so if time runs out it's the least interesting players that
  // go without prices.
  players.sort((a, b) => (b.avgL5 ?? -1) - (a.avgL5 ?? -1));

  // The per-player pass is one request each — `tokenPrices` can't be batched
  // (see PLAYER_SALES_QUERY) — and the public API is paced at one call every
  // ~3s, so filling fifteen players takes the best part of a minute. `enrich:
  // false` returns the list without it, which is what the UI asks for first so
  // the screen is usable in seconds instead of blank; it then fills each row
  // in via scoutPlayerContext below.
  if (enrich) {
    const started = Date.now();
    const budgetMs = 40_000;
    for (const p of players) {
      if (Date.now() - started > budgetMs) break;
      const ctx = await getPlayerContext(p.slug, rarity).catch(() => null);
      if (!ctx) continue;
      p.inSeasonTrend = ctx.trend;
      p.valuation = ctx.valuation;
      p.lastPlayedAt = ctx.lastPlayedAt;
      p.clubAtLastGame = ctx.clubAtLastGame;
    }
  }

  return { league: comp?.displayName ?? null, players };
}

/** One player's prices and recency, for the UI's progressive fill. */
export function scoutPlayerContext(slug: string, rarity: string): Promise<PlayerContext> {
  return getPlayerContext(slug, rarity);
}
