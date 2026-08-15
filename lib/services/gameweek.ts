import { Prisma } from "@prisma/client";
import { config } from "../config";
import { prisma } from "../prisma";
import { publicGraphql, OPEN_FIXTURES_PUBLIC, FIXTURE_GAMES_PUBLIC } from "../sorare/publicClient";
import { projectFromPublic, recencyWeightedStartRate } from "./publicProjection";

/** Same window as the appearance counts the public API gives, so both signals cover the same period. */
const FORM_WINDOW = config.formWindow;

export interface Opponent {
  opponentRank: number | null;
  isHome: boolean;
}

/**
 * Maps each club playing this game week to who it faces and whether at home.
 *
 * A club can appear more than once in a week; the first game found wins, which
 * matches how the rest of the projection treats the week as a single fixture.
 */
export async function opponentsForFixture(fixtureSlug: string): Promise<Map<string, Opponent>> {
  const data = await publicGraphql<{
    so5: {
      so5Fixture: {
        games: {
          homeTeam: { slug: string; domesticLeagueRanking: number | null } | null;
          awayTeam: { slug: string; domesticLeagueRanking: number | null } | null;
        }[];
      } | null;
    };
  }>(FIXTURE_GAMES_PUBLIC, { slug: fixtureSlug });

  const out = new Map<string, Opponent>();
  for (const g of data?.so5?.so5Fixture?.games ?? []) {
    const home = g.homeTeam;
    const away = g.awayTeam;
    if (!home?.slug || !away?.slug) continue;
    if (!out.has(home.slug)) out.set(home.slug, { opponentRank: away.domesticLeagueRanking, isHome: true });
    if (!out.has(away.slug)) out.set(away.slug, { opponentRank: home.domesticLeagueRanking, isHome: false });
  }
  return out;
}

/**
 * Game-week sync and projection, both running off the public API so they work
 * without a Sorare login.
 */

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Refreshes the upcoming game weeks and returns the one to plan against. */
export async function syncFixtures(): Promise<string | null> {
  const data = await publicGraphql<{
    so5: {
      allSo5Fixtures: {
        nodes: {
          slug: string;
          displayName: string;
          gameWeek: number;
          startDate: string;
          endDate: string;
          cutOffDate: string;
        }[];
      };
    };
  }>(OPEN_FIXTURES_PUBLIC);

  const nodes = data?.so5?.allSo5Fixtures?.nodes ?? [];
  for (const n of nodes) {
    const row = {
      startDate: parseDate(n.startDate),
      endDate: parseDate(n.endDate),
      cutOffDate: parseDate(n.cutOffDate),
      displayName: n.displayName ?? null,
      gameWeek: n.gameWeek ?? null,
      state: "opened",
    };
    await prisma.fixture.upsert({ where: { slug: n.slug }, create: { slug: n.slug, ...row }, update: row });
  }

  // Plan against the next game week that hasn't locked yet; once it locks,
  // the following one is what you can still act on.
  const now = new Date();
  const next = nodes.find((n) => {
    const cut = parseDate(n.cutOffDate);
    return cut ? cut > now : false;
  });
  return next?.slug ?? nodes[0]?.slug ?? null;
}

/**
 * Recomputes projections for every player from enriched public data. Pure
 * local maths — no network — so it's cheap to re-run after any import.
 */
export async function recomputeFromPublic(fixtureSlug: string): Promise<number> {
  // Only players whose public data has actually been fetched. Projecting an
  // un-enriched player would read its empty club and zero appearances as fact
  // and score it 0 with a "sans club" note — wrong, and indistinguishable from
  // a real assessment. No projection at all is the honest answer, and the UI
  // falls back to Sorare's own number or the CSV average.
  // Who each club faces this game week, and whether at home — one call for the
  // whole fixture, where asking per player would be one paced request each.
  // Non-fatal: without it the projection simply carries no fixture adjustment.
  const opponents = await opponentsForFixture(fixtureSlug).catch(() => new Map<string, Opponent>());

  const [players, cards, clubs, appearances] = await Promise.all([
    prisma.player.findMany({ where: { enrichedAt: { not: null } } }),
    prisma.card.findMany(),
    prisma.club.findMany({ select: { slug: true, leagueRanking: true } }),
    // Real per-game history — this is what turns "titularisation" from an
    // appearance rate into an actual starting rate. Public since PLAYER_FORM
    // moved to `anyPlayer`, so it's available without a Sorare login; a
    // gallery that has never run the form sync simply has none and the
    // projection falls back, flagged via pStartBasis.
    prisma.appearance.findMany({
      where: { friendly: false },
      orderBy: { gameDate: "desc" },
      select: { playerSlug: true, started: true, gameDate: true },
    }),
  ]);
  if (!players.length) return 0;

  const rankByClub = new Map(clubs.map((c) => [c.slug, c.leagueRanking]));

  const startsByPlayer = new Map<string, { started: boolean }[]>();
  for (const a of appearances) {
    const list = startsByPlayer.get(a.playerSlug);
    // Newest first (the query orders by date desc), capped at the same window
    // the appearance counts use so the two signals describe the same period.
    if (!list) startsByPlayer.set(a.playerSlug, [{ started: a.started }]);
    else if (list.length < FORM_WINDOW) list.push({ started: a.started });
  }

  // Best bonus among the cards owned for that player, so the projection
  // reflects the card you'd actually field.
  const bonusByPlayer = new Map<string, number>();
  for (const c of cards) {
    bonusByPlayer.set(c.playerSlug, Math.max(bonusByPlayer.get(c.playerSlug) ?? 0, c.bonus));
  }

  const now = new Date();
  const rows = players.map((p) => {
    const injured = Boolean(p.injuryStatus && (!p.injuryUntil || p.injuryUntil > now));
    let recent: number[] = [];
    try {
      const parsed = p.recentScores ? JSON.parse(p.recentScores) : [];
      if (Array.isArray(parsed)) recent = parsed.filter((n): n is number => typeof n === "number");
    } catch {
      recent = [];
    }

    const starts = recencyWeightedStartRate(
      startsByPlayer.get(p.slug) ?? [],
      config.recencyHalflife
    );

    const fixtureOpponent = p.clubSlug ? opponents.get(p.clubSlug) : undefined;

    const form = projectFromPublic({
      position: p.position,
      app5: p.app5,
      app15: p.app15,
      avgL5: p.avgL5,
      avgL15: p.avgL15,
      avgL10Played: p.avgL10Played,
      sorareProjection: p.sorareProjection,
      recentScores: recent,
      injured,
      suspended: p.suspended,
      hasClub: Boolean(p.clubSlug),
      cardBonus: bonusByPlayer.get(p.slug) ?? 0,
      startRate: starts?.rate ?? null,
      startSample: starts?.sample ?? 0,
      ownRank: p.clubSlug ? rankByClub.get(p.clubSlug) ?? null : null,
      opponentRank: fixtureOpponent?.opponentRank ?? null,
      isHome: fixtureOpponent?.isHome ?? null,
    });

    return { playerSlug: p.slug, form };
  });

  // One statement per chunk instead of one per player. Prisma runs the
  // statements of a transaction sequentially, so ~400 upserts meant ~400 round
  // trips to a database that may sit on another continent — slow enough to
  // exhaust the function's time budget and return a 504.
  const playerBySlug = new Map(players.map((p) => [p.slug, p]));

  const CHUNK = 250;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const values = rows.slice(i, i + CHUNK).map(({ playerSlug, form }) => {
      const p = playerBySlug.get(playerSlug);
      return Prisma.sql`(${playerSlug}, ${fixtureSlug}, ${form.pStart}, ${form.pPlay},
        ${form.pStartBasis}, ${form.confidence}, ${form.expected}, ${form.floor},
        ${form.l5}, ${form.l15}, ${form.note || null}, ${now},
        ${p?.sorareStarterOdds ?? null}, ${p?.sorareOddsProviderName ?? null})`;
    });
    await prisma.$executeRaw`
      INSERT INTO "Projection" ("playerSlug", "fixtureSlug", "pStart", "pPlay", "pStartBasis",
                                "confidence", "expectedScore", "floorScore", "l5", "l15",
                                "note", "computedAt",
                                "sorareStarterOdds", "sorareOddsProviderName")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("playerSlug", "fixtureSlug") DO UPDATE SET
        "pStart"                 = EXCLUDED."pStart",
        "pPlay"                  = EXCLUDED."pPlay",
        "pStartBasis"            = EXCLUDED."pStartBasis",
        "confidence"             = EXCLUDED."confidence",
        "expectedScore"          = EXCLUDED."expectedScore",
        "floorScore"             = EXCLUDED."floorScore",
        "l5"                     = EXCLUDED."l5",
        "l15"                    = EXCLUDED."l15",
        "note"                   = EXCLUDED."note",
        "computedAt"             = EXCLUDED."computedAt",
        "sorareStarterOdds"      = EXCLUDED."sorareStarterOdds",
        "sorareOddsProviderName" = EXCLUDED."sorareOddsProviderName"
    `;
  }

  await prisma.syncLog.create({
    data: { job: "projections", status: "ok", detail: `${rows.length} joueurs · ${fixtureSlug}` },
  });
  return rows.length;
}
