import { config } from "../config";
import { prisma } from "../prisma";
import * as apiFootball from "./apiFootball";

/**
 * Club pre-season friendlies, from API-Football into the Appearance table.
 *
 * Why this exists: Sorare's public API carries *international* friendlies
 * (they show up as competition "Friendlies") but no club pre-season games at
 * all — verified against several squads, there's simply a gap between the
 * last competitive game and the league restart. That gap is exactly when you
 * most need to know who is back, who is playing 90 minutes and who hasn't
 * featured, so this fills it from the API-Football integration the app
 * already uses for confirmed line-ups.
 *
 * Budget-aware by design: the free tier is 100 requests/day, and this costs
 * roughly (1 per club) + (1 per friendly fixture found). It's user-triggered
 * only, never on the cron, and stops early when the budget runs out — a
 * partial sync is fine, the next run picks up what's missing.
 */

/** Normalises "J. Bellingham" / "Jude Bellingham" / "BELLINGHAM" to a comparable key. */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Last name only — the part both "J. Bellingham" and "Jude Bellingham" agree on. */
export function lastName(name: string): string {
  const parts = nameKey(name).split(" ");
  return parts[parts.length - 1] ?? "";
}

export interface FriendlySyncProgress {
  clubsChecked: number;
  fixturesFound: number;
  appearancesWritten: number;
  /** True when the time/request budget stopped the run before every club was done. */
  partial: boolean;
}

export async function syncClubFriendlies(
  budgetMs = 45_000,
  maxRequests = 60
): Promise<FriendlySyncProgress> {
  const started = Date.now();
  let requests = 0;
  const progress: FriendlySyncProgress = {
    clubsChecked: 0,
    fixturesFound: 0,
    appearancesWritten: 0,
    partial: false,
  };

  // Only clubs we actually own cards for — never the whole league.
  const cards = await prisma.card.findMany({
    select: { player: { select: { clubSlug: true } } },
  });
  const clubSlugs = [...new Set(cards.map((c) => c.player.clubSlug).filter((s): s is string => !!s))];
  if (!clubSlugs.length) return progress;

  const clubs = await prisma.club.findMany({ where: { slug: { in: clubSlugs } } });
  const season = new Date().getFullYear();

  for (const club of clubs) {
    if (Date.now() - started > budgetMs || requests >= maxRequests) {
      progress.partial = true;
      break;
    }

    let teamId: number | null;
    try {
      // Cached after the first lookup (ExternalTeamMapping), so this is
      // usually free after the initial run.
      teamId = await apiFootball.resolveTeamId(club.slug, club.name);
      requests++;
    } catch {
      continue; // one club's lookup failing shouldn't end the run
    }
    if (!teamId) continue;
    progress.clubsChecked++;

    let fixtures: apiFootball.FriendlyFixture[];
    try {
      fixtures = await apiFootball.recentFriendlies(teamId, season);
      requests++;
    } catch {
      continue;
    }
    progress.fixturesFound += fixtures.length;

    // Squad players at this club, to match API-Football's names back to our slugs.
    const players = await prisma.player.findMany({
      where: { clubSlug: club.slug },
      select: { slug: true, displayName: true },
    });
    if (!players.length) continue;

    const byLastName = new Map<string, { slug: string; displayName: string }[]>();
    for (const p of players) {
      const key = lastName(p.displayName);
      if (!key) continue;
      const list = byLastName.get(key) ?? [];
      list.push(p);
      byLastName.set(key, list);
    }

    for (const fixture of fixtures) {
      if (Date.now() - started > budgetMs || requests >= maxRequests) {
        progress.partial = true;
        break;
      }

      let stats: apiFootball.FixturePlayerStat[];
      try {
        stats = await apiFootball.fixturePlayerStats(fixture.fixtureId);
        requests++;
      } catch {
        continue;
      }

      const competition = `Amical · ${fixture.homeName} - ${fixture.awayName}`;
      for (const stat of stats) {
        const candidates = byLastName.get(lastName(stat.name));
        // Skip ambiguous matches outright rather than risk attributing a
        // performance to the wrong player — two team-mates sharing a last
        // name is rare but the cost of guessing wrong is a bogus stat line.
        if (!candidates || candidates.length !== 1) continue;
        const player = candidates[0];

        await prisma.appearance.upsert({
          where: { playerSlug_gameId: { playerSlug: player.slug, gameId: `af-${fixture.fixtureId}` } },
          create: {
            playerSlug: player.slug,
            gameId: `af-${fixture.fixtureId}`,
            gameDate: fixture.date,
            competition,
            minutes: stat.minutes,
            started: stat.started,
            onGameSheet: true,
            goals: stat.goals,
            assists: stat.assists,
            rating: stat.rating,
            friendly: true,
            source: "api_football",
          },
          update: {
            gameDate: fixture.date,
            competition,
            minutes: stat.minutes,
            started: stat.started,
            goals: stat.goals,
            assists: stat.assists,
            rating: stat.rating,
          },
        });
        progress.appearancesWritten++;
      }
    }
  }

  await prisma.syncLog.create({
    data: {
      job: "friendlies",
      status: "ok",
      detail: `${progress.clubsChecked} clubs, ${progress.fixturesFound} amicaux, ${progress.appearancesWritten} perfs${
        progress.partial ? " (partiel — relance pour la suite)" : ""
      }`,
    },
  });

  return progress;
}

export interface FriendlyAppearance {
  gameId: string;
  date: string;
  competition: string | null;
  minutes: number;
  started: boolean;
  goals: number | null;
  assists: number | null;
  rating: number | null;
}

/**
 * Why a player's friendlies list is empty, so the UI can say something useful
 * instead of hiding the section. An empty list on its own is ambiguous: it
 * could mean the player genuinely didn't feature, that the sync has never
 * run, or that there's no API-Football key at all — and silently rendering
 * nothing made a missing integration look like a player with no pre-season.
 */
export type FriendliesStatus = "ok" | "not_configured" | "never_synced";

export async function friendliesStatus(): Promise<FriendliesStatus> {
  if (!config.apiFootballKey) return "not_configured";
  const lastOk = await prisma.syncLog.findFirst({
    where: { job: "friendlies", status: "ok" },
    orderBy: { ranAt: "desc" },
    select: { id: true },
  });
  return lastOk ? "ok" : "never_synced";
}

/** Locally-stored club friendlies for one player, newest first — merged into the player popup. */
export async function friendliesForPlayer(playerSlug: string, limit = 6): Promise<FriendlyAppearance[]> {
  const rows = await prisma.appearance.findMany({
    where: { playerSlug, friendly: true },
    orderBy: { gameDate: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    gameId: r.gameId,
    date: (r.gameDate ?? new Date()).toISOString(),
    competition: r.competition,
    minutes: r.minutes,
    started: r.started,
    goals: r.goals,
    assists: r.assists,
    rating: r.rating,
  }));
}
