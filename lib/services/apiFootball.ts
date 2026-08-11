/**
 * Thin client for api-sports.io's API-Football (v3). GET-only, one header
 * for auth. Free tier: 100 requests/day, every endpoint included — no
 * scraping, this is their documented public API.
 *
 * IMPORTANT — what this can and can't tell you:
 * The /fixtures/lineups endpoint only returns the OFFICIAL lineup, published
 * roughly 20-40 minutes before kickoff once the club submits its team sheet.
 * There is no "probable lineup" days in advance on this API — that's a paid
 * add-on on a different provider (Sportmonks Expected Lineups). So this
 * source is a late safety check, not a planning tool: call it close to
 * kickoff to catch a surprise bench decision before your Sorare line-up
 * locks, not three days out.
 */
import { config } from "../config";
import { prisma } from "../prisma";

async function get<T = any>(path: string, params: Record<string, string | number>): Promise<T> {
  if (!config.apiFootballKey) {
    throw new Error("APIFOOTBALL_KEY is not set — sign up free at api-sports.io and add it to your env vars.");
  }
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])));
  const r = await fetch(`${config.apiFootballUrl}${path}?${qs}`, {
    headers: { "x-apisports-key": config.apiFootballKey },
  });
  if (!r.ok) throw new Error(`API-Football HTTP ${r.status}`);
  const body = await r.json();
  if (body.errors && Object.keys(body.errors).length) {
    throw new Error(`API-Football error: ${JSON.stringify(body.errors)}`);
  }
  return body;
}

/** Resolves and caches a club's API-Football team id from its name. One request the first time, free after. */
export async function resolveTeamId(clubSlug: string, clubName: string): Promise<number | null> {
  const cached = await prisma.externalTeamMapping.findUnique({ where: { clubSlug } });
  if (cached) return cached.apiFootballTeamId;

  const data = await get<{ response: { team: { id: number; name: string } }[] }>("/teams", { search: clubName });
  const match = data.response[0];
  if (!match) return null;

  await prisma.externalTeamMapping.create({
    data: { clubSlug, apiFootballTeamId: match.team.id },
  });
  return match.team.id;
}

/** Resolves and caches a player's API-Football id, scoped to their team to avoid name collisions. */
export async function resolvePlayerId(
  playerSlug: string,
  playerName: string,
  apiFootballTeamId: number
): Promise<number | null> {
  const cached = await prisma.externalPlayerMapping.findUnique({ where: { playerSlug } });
  if (cached) return cached.apiFootballPlayerId;

  const data = await get<{ response: { player: { id: number; name: string } }[] }>("/players", {
    team: apiFootballTeamId,
    search: playerName,
    season: new Date().getFullYear(),
  });
  const match = data.response[0];
  if (!match) return null;

  await prisma.externalPlayerMapping.create({
    data: { playerSlug, apiFootballPlayerId: match.player.id },
  });
  return match.player.id;
}

/** The team's next scheduled match: id + kickoff time, so callers know whether it's worth checking for a lineup yet. */
export async function nextFixture(apiFootballTeamId: number): Promise<{ fixtureId: number; kickoff: Date } | null> {
  const data = await get<{ response: { fixture: { id: number; date: string } }[] }>("/fixtures", {
    team: apiFootballTeamId,
    next: 1,
  });
  const match = data.response[0];
  if (!match) return null;
  return { fixtureId: match.fixture.id, kickoff: new Date(match.fixture.date) };
}

export interface ConfirmedLineup {
  confirmed: true;
  startingIds: Set<number>;
}
export interface NoLineupYet {
  confirmed: false;
}

/**
 * API-Football's league id for club friendlies. Sorare's own API carries
 * international friendlies but no club pre-season games, so this is the only
 * way to see who is actually playing again before the league restarts.
 */
export const FRIENDLIES_CLUBS_LEAGUE = 667;

export interface FriendlyFixture {
  fixtureId: number;
  date: Date;
  homeName: string;
  awayName: string;
  homeGoals: number | null;
  awayGoals: number | null;
}

/** Recent club friendlies for a team, newest first. One request per club. */
export async function recentFriendlies(
  apiFootballTeamId: number,
  season: number,
  last = 5
): Promise<FriendlyFixture[]> {
  const data = await get<{
    response: {
      fixture: { id: number; date: string };
      teams: { home: { name: string }; away: { name: string } };
      goals: { home: number | null; away: number | null };
    }[];
  }>("/fixtures", { team: apiFootballTeamId, league: FRIENDLIES_CLUBS_LEAGUE, season, last });

  return (data.response ?? []).map((f) => ({
    fixtureId: f.fixture.id,
    date: new Date(f.fixture.date),
    homeName: f.teams.home.name,
    awayName: f.teams.away.name,
    homeGoals: f.goals.home,
    awayGoals: f.goals.away,
  }));
}

export interface FixturePlayerStat {
  apiFootballPlayerId: number;
  name: string;
  minutes: number;
  started: boolean;
  goals: number | null;
  assists: number | null;
  rating: number | null;
}

/** Per-player stats for one fixture. One request per fixture — mind the 100/day free tier. */
export async function fixturePlayerStats(apiFootballFixtureId: number): Promise<FixturePlayerStat[]> {
  const data = await get<{
    response: {
      players: {
        player: { id: number; name: string };
        statistics: {
          games: { minutes: number | null; rating: string | null; substitute: boolean | null };
          goals: { total: number | null; assists: number | null };
        }[];
      }[];
    }[];
  }>("/fixtures/players", { fixture: apiFootballFixtureId });

  const out: FixturePlayerStat[] = [];
  for (const team of data.response ?? []) {
    for (const p of team.players ?? []) {
      const s = p.statistics?.[0];
      if (!s) continue;
      const minutes = s.games?.minutes ?? 0;
      out.push({
        apiFootballPlayerId: p.player.id,
        name: p.player.name,
        minutes,
        // `substitute: false` means they were in the starting XI. A player who
        // never came on has minutes 0 and shouldn't read as a starter either.
        started: s.games?.substitute === false && minutes > 0,
        goals: s.goals?.total ?? null,
        assists: s.goals?.assists ?? null,
        rating: s.games?.rating != null ? Number(s.games.rating) : null,
      });
    }
  }
  return out;
}

/** Only returns confirmed==true once the club has actually submitted a team sheet — usually 20-40 min pre-kickoff. */
export async function confirmedLineup(apiFootballFixtureId: number): Promise<ConfirmedLineup | NoLineupYet> {
  const data = await get<{ response: { startXI: { player: { id: number } }[] }[] }>("/fixtures/lineups", {
    fixture: apiFootballFixtureId,
  });
  if (!data.response.length) return { confirmed: false };

  const startingIds = new Set<number>();
  for (const team of data.response) {
    for (const p of team.startXI ?? []) startingIds.add(p.player.id);
  }
  return { confirmed: true, startingIds };
}
