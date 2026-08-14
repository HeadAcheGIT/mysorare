import type { Appearance } from "@prisma/client";
import { prisma } from "../prisma";
import { graphql } from "../sorare/client";
import { MY_LINEUPS_FOR_FIXTURE } from "../sorare/queries";

/**
 * "What did I actually align" and "who called it right" — the two halves of
 * the GW-review board. Ground truth for the first comes from Sorare's own
 * authenticated `mySo5Lineups` (see syncAlignedLineups); the second grades
 * our Projection.pStart and Sorare's own Player/Projection.sorareStarterOdds
 * (see lib/services/enrich.ts) against what actually happened.
 */

type So5LineupNode = {
  id: string;
  so5Leaderboard: {
    slug: string;
    displayName: string | null;
    division: number | null;
  } | null;
  so5Appearances: {
    captain: boolean;
    position: string | null;
    score: number | null;
    anyCard: { slug: string; anyPlayer: { slug: string } | null } | null;
  }[];
};

/**
 * Pulls every lineup entered for one fixture — across every division/
 * leaderboard, matching how Sorare itself splits a game week — from the
 * authenticated API, and upserts it as the ground truth for "what did I
 * actually align". Call for the current fixture plus, on first rollout, a
 * handful of recent closed ones so there's enough history to grade the two
 * probability sources against. One fixture failing (a stale token, a schema
 * drift) shouldn't sink the others, so each is caught and logged separately.
 */
export async function syncAlignedLineups(fixtureSlugs: string[]): Promise<{ fixtures: number; rows: number }> {
  let rows = 0;
  let failed = 0;

  for (const fixtureSlug of fixtureSlugs) {
    try {
      const data = await graphql<{
        so5: { so5Fixture: { mySo5Lineups: So5LineupNode[] } | null };
      }>(MY_LINEUPS_FOR_FIXTURE, { slug: fixtureSlug });
      const lineups = data?.so5?.so5Fixture?.mySo5Lineups ?? [];

      for (const lineup of lineups) {
        for (const app of lineup.so5Appearances ?? []) {
          const cardSlug = app.anyCard?.slug;
          const playerSlug = app.anyCard?.anyPlayer?.slug;
          if (!cardSlug || !playerSlug) continue;

          const common = {
            leaderboardSlug: lineup.so5Leaderboard?.slug ?? null,
            leaderboardName: lineup.so5Leaderboard?.displayName ?? null,
            division: lineup.so5Leaderboard?.division ?? null,
            captain: Boolean(app.captain),
            position: app.position ?? null,
            actualScore: app.score ?? null,
          };
          await prisma.alignedLineup.upsert({
            where: { so5LineupId_cardSlug: { so5LineupId: lineup.id, cardSlug } },
            create: { so5LineupId: lineup.id, fixtureSlug, playerSlug, cardSlug, ...common },
            update: { ...common, syncedAt: new Date() },
          });
          rows++;
        }
      }
    } catch (err) {
      failed++;
      await prisma.syncLog.create({
        data: {
          job: "aligned_lineups",
          status: "error",
          detail: `${fixtureSlug}: ${(err as Error).message}`.slice(0, 2000),
        },
      });
    }
  }

  await prisma.syncLog.create({
    data: {
      job: "aligned_lineups",
      status: failed ? "error" : "ok",
      detail: `${rows} rows across ${fixtureSlugs.length} fixture(s)${failed ? `, ${failed} failed` : ""}`,
    },
  });
  return { fixtures: fixtureSlugs.length, rows };
}

export interface ComparisonRow {
  playerSlug: string;
  playerName: string;
  picture: string | null;
  cardSlug: string;
  captain: boolean;
  position: string | null;
  leaderboardSlug: string | null;
  leaderboardName: string | null;
  division: number | null;
  /** Our own model's pStart at computation time, from Projection. */
  ourPStart: number | null;
  /** What ourPStart measures — see Projection.pStartBasis. Drives the label, so "titulaire" is never claimed for an appearance rate. */
  ourPStartBasis: "starts" | "appearances" | "baseline" | null;
  /** Sorare's own starter odds (via its data partner) at computation time. */
  sorareStarterOdds: number | null;
  sorareOddsProviderName: string | null;
  sorareOddsProviderIconUrl: string | null;
  /** So5 score once the fixture has been played — null until then. */
  actualScore: number | null;
  /** Whether they actually started IRL, from Appearance — null while unknown (fixture not played yet, or no matching Appearance synced). */
  actualStarted: boolean | null;
  /** |ourPStart - sorareStarterOdds| — null unless both sources have a reading. */
  disagreement: number | null;
}

/** Grouped the same way Sorare itself splits a game week — one entry per division/leaderboard. */
export interface DivisionGroup {
  leaderboardSlug: string | null;
  leaderboardName: string | null;
  division: number | null;
  rows: ComparisonRow[];
}

/** Joins AlignedLineup + Projection + Appearance for one fixture into per-player comparison rows, grouped by division. */
export async function alignedLineupComparison(fixtureSlug: string): Promise<DivisionGroup[]> {
  const [aligned, projections, fixture] = await Promise.all([
    prisma.alignedLineup.findMany({ where: { fixtureSlug } }),
    prisma.projection.findMany({ where: { fixtureSlug } }),
    prisma.fixture.findUnique({ where: { slug: fixtureSlug } }),
  ]);
  if (!aligned.length) return [];

  const playerSlugs = [...new Set(aligned.map((a) => a.playerSlug))];
  const [players, appearances] = await Promise.all([
    prisma.player.findMany({ where: { slug: { in: playerSlugs } } }),
    fixture?.startDate && fixture?.endDate
      ? prisma.appearance.findMany({
          where: { playerSlug: { in: playerSlugs }, gameDate: { gte: fixture.startDate, lte: fixture.endDate } },
        })
      : Promise.resolve<Appearance[]>([]),
  ]);

  const playerMap = new Map(players.map((p) => [p.slug, p]));
  const projMap = new Map(projections.map((p) => [p.playerSlug, p]));
  const appsByPlayer = new Map<string, typeof appearances>();
  for (const a of appearances) {
    if (!appsByPlayer.has(a.playerSlug)) appsByPlayer.set(a.playerSlug, []);
    appsByPlayer.get(a.playerSlug)!.push(a);
  }

  const rows: ComparisonRow[] = aligned.map((row) => {
    const player = playerMap.get(row.playerSlug);
    const proj = projMap.get(row.playerSlug);
    const apps = appsByPlayer.get(row.playerSlug) ?? [];
    const actualStarted = apps.length ? apps.some((a) => a.started) : null;

    const ourPStart = proj?.pStart ?? null;
    const sorareStarterOdds = proj?.sorareStarterOdds ?? null;

    return {
      playerSlug: row.playerSlug,
      playerName: player?.displayName ?? row.playerSlug,
      picture: player?.pictureUrl ?? null,
      cardSlug: row.cardSlug,
      captain: row.captain,
      position: row.position,
      leaderboardSlug: row.leaderboardSlug,
      leaderboardName: row.leaderboardName,
      division: row.division,
      ourPStart,
      ourPStartBasis: (proj?.pStartBasis as ComparisonRow["ourPStartBasis"]) ?? null,
      sorareStarterOdds,
      sorareOddsProviderName: proj?.sorareOddsProviderName ?? null,
      sorareOddsProviderIconUrl: player?.sorareOddsProviderIconUrl ?? null,
      actualScore: row.actualScore,
      actualStarted,
      disagreement: ourPStart != null && sorareStarterOdds != null ? Math.abs(ourPStart - sorareStarterOdds) : null,
    };
  });

  const groups = new Map<string, DivisionGroup>();
  for (const row of rows) {
    const key = row.leaderboardSlug ?? "__none__";
    if (!groups.has(key)) {
      groups.set(key, {
        leaderboardSlug: row.leaderboardSlug,
        leaderboardName: row.leaderboardName,
        division: row.division,
        rows: [],
      });
    }
    groups.get(key)!.rows.push(row);
  }
  return [...groups.values()].sort((a, b) => (a.division ?? 999) - (b.division ?? 999));
}

export interface SourceAccuracy {
  /** Rows where the outcome is known and this source had a reading. */
  graded: number;
  hits: number;
  /** Fraction of graded rows where "predicted to start" (>= 50%) matched the real outcome — null with nothing graded yet. */
  hitRate: number | null;
  /** Mean squared error between the predicted probability and the 0/1 outcome — lower is better, null with nothing graded yet. */
  brierScore: number | null;
}

/**
 * Grades both probability sources against known outcomes — pure and testable
 * on its own, independent of how the rows were fetched. A row only counts
 * once actualStarted is known (the fixture has been played and an Appearance
 * synced); rows still pending kickoff are silently excluded rather than
 * counted as a miss.
 */
export function summarizeAccuracy(
  rows: Pick<ComparisonRow, "ourPStart" | "sorareStarterOdds" | "actualStarted">[]
): { ours: SourceAccuracy; sorare: SourceAccuracy } {
  const grade = (pick: (r: (typeof rows)[number]) => number | null): SourceAccuracy => {
    let hits = 0;
    let graded = 0;
    let sqErrSum = 0;
    for (const r of rows) {
      if (r.actualStarted == null) continue;
      const p = pick(r);
      if (p == null) continue;
      graded++;
      const outcome = r.actualStarted ? 1 : 0;
      if (p >= 0.5 === r.actualStarted) hits++;
      sqErrSum += (p - outcome) ** 2;
    }
    return {
      graded,
      hits,
      hitRate: graded ? round(hits / graded) : null,
      brierScore: graded ? round(sqErrSum / graded) : null,
    };
  };

  return { ours: grade((r) => r.ourPStart), sorare: grade((r) => r.sorareStarterOdds) };
}

function round(v: number, dp = 3) {
  const m = 10 ** dp;
  return Math.round(v * m) / m;
}
