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
  homeTeam: { name: string; picture: string | null } | null;
  awayTeam: { name: string; picture: string | null } | null;
  homeScore: number | null;
  awayScore: number | null;
  /// So5 score for this player in this game — only present for past games.
  so5Score: number | null;
}

export interface PlayerDetail {
  slug: string;
  name: string;
  position: string;
  age: number | null;
  picture: string | null;
  club: { name: string; picture: string | null } | null;
  injury: string | null;
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
    squaredPictureUrl
    activeClub { ... on Club { name pictureUrl } }
    activeInjuries { status expectedEndDate }
    pastGames: anyPastGames(first: 8) {
      nodes {
        id
        date
        statusTyped
        homeScore
        awayScore
        competition { displayName }
        homeTeam { ... on Club { name pictureUrl } }
        awayTeam { ... on Club { name pictureUrl } }
        playerGameScore(playerSlug: $slug) { score }
      }
    }
    futureGames: anyFutureGames(first: 5) {
      nodes {
        id
        date
        statusTyped
        competition { displayName }
        homeTeam { ... on Club { name pictureUrl } }
        awayTeam { ... on Club { name pictureUrl } }
      }
    }
  }
}`;

function team(t: { name: string; pictureUrl: string | null } | null): GameEntry["homeTeam"] {
  return t ? { name: t.name, picture: t.pictureUrl } : null;
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
    pastGames: (p.pastGames?.nodes ?? []).map(
      (g: any): GameEntry => ({
        id: g.id,
        date: g.date,
        status: g.statusTyped,
        competition: g.competition?.displayName ?? null,
        homeTeam: team(g.homeTeam),
        awayTeam: team(g.awayTeam),
        homeScore: g.homeScore ?? null,
        awayScore: g.awayScore ?? null,
        so5Score: g.playerGameScore?.score ?? null,
      })
    ),
    futureGames: (p.futureGames?.nodes ?? []).map(
      (g: any): GameEntry => ({
        id: g.id,
        date: g.date,
        status: g.statusTyped,
        competition: g.competition?.displayName ?? null,
        homeTeam: team(g.homeTeam),
        awayTeam: team(g.awayTeam),
        homeScore: null,
        awayScore: null,
        so5Score: null,
      })
    ),
  };
}
