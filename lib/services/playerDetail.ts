import { publicGraphql } from "../sorare/publicClient";

/**
 * A player's recent and upcoming fixtures with real-world and So5 scores —
 * the "tap a player, see their matches" view. All from `anyPlayer(slug)`,
 * the only shape Sorare accepts for a single player's game connections
 * (selecting them within the batched `players(slugs)` list is rejected, same
 * restriction as `tokenPrices` — see scouting.ts).
 */

export interface GameEntry {
  id: string;
  date: string;
  status: string;
  competition: string | null;
  /// Heuristic only: the public API has no structured "is this a friendly"
  /// flag, so this is a text match on the competition name.
  friendly: boolean;
  homeTeam: { name: string; picture: string | null } | null;
  awayTeam: { name: string; picture: string | null } | null;
  homeScore: number | null;
  awayScore: number | null;
  /// So5 score for this player in this game — only present for past games.
  so5Score: number | null;
  /// The closest thing the public API exposes to an "AA" score — Sorare's own
  /// all-round rating for the game, distinct from the fantasy So5 score.
  allAroundScore: number | null;
  minutesPlayed: number | null;
  goals: number | null;
  assists: number | null;
}

/**
 * How many cards of this player are in circulation this season, by rarity —
 * "is this price justified by scarcity". Common has unlimited supply so
 * Sorare doesn't count it; super rare/unique are dropped here too, since this
 * manager's gallery (and so everything this figure is compared against) is
 * exclusively limited/rare — see TRACKED_RARITIES in lib/types.ts.
 */
export interface CardSupply {
  season: number;
  limited: number;
  rare: number;
}

export interface PlayerDetail {
  slug: string;
  name: string;
  position: string;
  age: number | null;
  picture: string | null;
  club: { name: string; picture: string | null } | null;
  injury: string | null;
  /** Powers the U23 badge — see u23Status() in lib/types.ts. */
  birthDate: string | null;
  /** The club's domestic league/division, for the championship badge. */
  competitionName: string | null;
  cardSupply: CardSupply | null;
  pastGames: GameEntry[];
  futureGames: GameEntry[];
}

const QUERY = `
query PlayerDetail($slug: String!) {
  anyPlayer(slug: $slug) {
    slug
    displayName
    anyPositions
    age
    # anyPlayer resolves AnyPlayerInterface, which exposes birthDay (date-only)
    # and NOT birthDate — asking for the latter 422s the whole query and takes
    # the popup down with it. Same trap as PLAYERS_BY_SLUG in
    # lib/sorare/publicClient.ts; aliased to the name consumers already use.
    birthDate: birthDay
    squaredPictureUrl
    activeClub { ... on Club { name pictureUrl domesticLeague { displayName } } }
    activeInjuries { status expectedEndDate }
    # Verified live against the public API: resolves directly on
    # AnyPlayerInterface, no inline fragment needed (unlike birthDate above).
    cardSupply { limited rare season { startYear } }
    pastGames: anyPastGames(first: 8) {
      nodes {
        id
        date
        statusTyped
        homeScore
        awayScore
        competition { displayName }
        homeTeam { ... on Club { name pictureUrl } ... on NationalTeam { name pictureUrl } }
        awayTeam { ... on Club { name pictureUrl } ... on NationalTeam { name pictureUrl } }
        playerGameScore(playerSlug: $slug) {
          score
          ... on PlayerGameScore { allAroundScore }
          anyPlayerGameStats {
            ... on PlayerGameStats { minsPlayed goals goalAssist }
          }
        }
      }
    }
    futureGames: anyFutureGames(first: 5) {
      nodes {
        id
        date
        statusTyped
        competition { displayName }
        homeTeam { ... on Club { name pictureUrl } ... on NationalTeam { name pictureUrl } }
        awayTeam { ... on Club { name pictureUrl } ... on NationalTeam { name pictureUrl } }
      }
    }
  }
}`;

function team(t: { name: string; pictureUrl: string | null } | null): GameEntry["homeTeam"] {
  return t ? { name: t.name, picture: t.pictureUrl } : null;
}

/// No structured "friendly" flag exists on the public schema (CompetitionType
/// is only CLUB/INTERNATIONAL) — this is a best-effort text match.
export function isFriendly(competition: string | null): boolean {
  return /friendl|amical/i.test(competition ?? "");
}

/** The most recent season's entry — "current supply" for a player still active. */
export function latestCardSupply(rows: { limited: number; rare: number; season: { startYear: number } }[]): CardSupply | null {
  if (!rows.length) return null;
  const latest = rows.reduce((a, b) => (b.season.startYear > a.season.startYear ? b : a));
  return { season: latest.season.startYear, limited: latest.limited, rare: latest.rare };
}

export async function getPlayerDetail(slug: string): Promise<PlayerDetail | null> {
  const data = await publicGraphql<{ anyPlayer: any }>(QUERY, { slug });
  const p = data.anyPlayer;
  if (!p) return null;

  const injury = p.activeInjuries?.[0];

  return {
    slug: p.slug,
    name: p.displayName ?? p.slug,
    position: p.anyPositions?.[0] ?? "Midfielder",
    age: p.age ?? null,
    picture: p.squaredPictureUrl ?? null,
    club: p.activeClub ? { name: p.activeClub.name, picture: p.activeClub.pictureUrl } : null,
    injury: injury?.status ?? null,
    birthDate: p.birthDate ?? null,
    competitionName: p.activeClub?.domesticLeague?.displayName ?? null,
    cardSupply: latestCardSupply(p.cardSupply ?? []),
    pastGames: (p.pastGames?.nodes ?? []).map((g: any): GameEntry => {
      const competition = g.competition?.displayName ?? null;
      const stats = g.playerGameScore?.anyPlayerGameStats;
      return {
        id: g.id,
        date: g.date,
        status: g.statusTyped,
        competition,
        friendly: isFriendly(competition),
        homeTeam: team(g.homeTeam),
        awayTeam: team(g.awayTeam),
        homeScore: g.homeScore ?? null,
        awayScore: g.awayScore ?? null,
        so5Score: g.playerGameScore?.score ?? null,
        allAroundScore: g.playerGameScore?.allAroundScore ?? null,
        minutesPlayed: stats?.minsPlayed ?? null,
        goals: stats?.goals ?? null,
        assists: stats?.goalAssist ?? null,
      };
    }),
    futureGames: (p.futureGames?.nodes ?? []).map((g: any): GameEntry => {
      const competition = g.competition?.displayName ?? null;
      return {
        id: g.id,
        date: g.date,
        status: g.statusTyped,
        competition,
        friendly: isFriendly(competition),
        homeTeam: team(g.homeTeam),
        awayTeam: team(g.awayTeam),
        homeScore: null,
        awayScore: null,
        so5Score: null,
        allAroundScore: null,
        minutesPlayed: null,
        goals: null,
        assists: null,
      };
    }),
  };
}
