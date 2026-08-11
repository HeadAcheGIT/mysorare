import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { publicGraphql, PLAYERS_BY_SLUG, PLAYERS_PER_QUERY } from "../sorare/publicClient";

/**
 * Fills in everything the CSV can't: player photos, club and badge, injuries,
 * suspensions, recent So5 scores and Sorare's own projection — all from the
 * public API, no login and therefore no 2FA.
 *
 * Work is selected by staleness, not by a cursor: each call takes the players
 * that have never been enriched first, then the least recently enriched. That
 * makes an interrupted run self-healing — whatever was missed is simply what
 * the next call picks up — where a cursor would silently leave holes, and a
 * player with no data looks identical to a player with no club.
 */

/**
 * Players handled per HTTP call to this app. Several GraphQL queries run inside
 * one invocation on purpose: the unauthenticated limit is 20 calls/minute, and
 * pacing only applies within an invocation, so one query per request would let
 * the browser loop outrun the limit and spend its time on 429 retries.
 */
export const ENRICH_BATCH_SIZE = PLAYERS_PER_QUERY * 3;

/** Leaves room under the route's 60s maxDuration for the final DB writes. */
const TIME_BUDGET_MS = 35_000;

/** Re-enrich anything older than this so injuries and form don't go stale. */
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export type EnrichProgress = {
  processed: number;
  /** Players still lacking fresh data after this call. Zero means done. */
  remaining: number;
  total: number;
  /** Players that have never been enriched at all — the ones that break insights. */
  neverEnriched: number;
};

type ApiPlayer = {
  slug: string;
  displayName: string | null;
  age: number | null;
  birthDate: string | null;
  shirtNumber: number | null;
  anyPositions: string[] | null;
  avatarPictureUrl: string | null;
  squaredPictureUrl: string | null;
  country: { code: string | null } | null;
  activeClub: {
    slug: string;
    name: string;
    pictureUrl: string | null;
    country: { code: string | null } | null;
    domesticLeague: { slug: string; displayName: string } | null;
  } | null;
  activeInjuries: { status: string | null; expectedEndDate: string | null }[] | null;
  activeSuspensions: { reason: string | null; endDate: string | null }[] | null;
  nextClassicFixtureProjectedScore: number | null;
  lastFiveSo5Appearances: number | null;
  lastFifteenSo5Appearances: number | null;
  seasonAppearances: number | null;
  avgL5: number | null;
  avgL15: number | null;
  avgL10Played: number | null;
  rawPlayerGameScores: (number | null)[] | null;
};

export function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function enrichBatch(): Promise<EnrichProgress> {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS);

  const [total, neverEnrichedBefore, due] = await Promise.all([
    prisma.player.count(),
    prisma.player.count({ where: { enrichedAt: null } }),
    prisma.player.findMany({
      where: { OR: [{ enrichedAt: null }, { enrichedAt: { lt: staleBefore } }] },
      select: { slug: true },
      // Nulls first: a player with no data at all is the one actively producing
      // wrong advice, so it gets refreshed before one that's merely stale.
      orderBy: [{ enrichedAt: { sort: "asc", nulls: "first" } }, { slug: "asc" }],
      take: ENRICH_BATCH_SIZE,
    }),
  ]);

  if (!due.length) {
    if (neverEnrichedBefore === 0 && total > 0) {
      await prisma.syncLog.create({
        data: { job: "enrich", status: "ok", detail: `${total} joueurs à jour` },
      });
    }
    return { processed: 0, remaining: 0, total, neverEnriched: neverEnrichedBefore };
  }

  const started = Date.now();
  let processed = 0;
  for (let i = 0; i < due.length; i += PLAYERS_PER_QUERY) {
    if (i > 0 && Date.now() - started > TIME_BUDGET_MS) break;
    const page = due.slice(i, i + PLAYERS_PER_QUERY);
    await enrichPlayers(page.map((p) => p.slug));
    processed += page.length;
  }

  const [remaining, neverEnriched] = await Promise.all([
    prisma.player.count({ where: { OR: [{ enrichedAt: null }, { enrichedAt: { lt: staleBefore } }] } }),
    prisma.player.count({ where: { enrichedAt: null } }),
  ]);

  if (remaining === 0) {
    await prisma.syncLog.create({
      data: { job: "enrich", status: "ok", detail: `${total} joueurs enrichis` },
    });
  }
  return { processed, remaining, total, neverEnriched };
}

/** Fetches one query's worth of players and writes them in two statements. */
async function enrichPlayers(slugs: string[]): Promise<void> {
  const data = await publicGraphql<{ players: ApiPlayer[] }>(PLAYERS_BY_SLUG, { slugs });
  const players = (data.players ?? []).filter((p) => p?.slug);
  if (!players.length) return;

  const now = new Date();

  // Clubs first: Player.clubSlug is a foreign key, so the club has to exist
  // before the player row can point at it. Deduplicated because a batch of
  // team-mates would otherwise hit the same row twice in one statement, which
  // Postgres rejects outright.
  const clubs = new Map<string, NonNullable<ApiPlayer["activeClub"]>>();
  for (const p of players) if (p.activeClub?.slug) clubs.set(p.activeClub.slug, p.activeClub);

  if (clubs.size) {
    const values = [...clubs.values()].map(
      (c) =>
        Prisma.sql`(${c.slug}, ${c.name ?? c.slug}, ${c.country?.code ?? null}, ${c.pictureUrl ?? null},
          ${c.domesticLeague?.slug ?? null}, ${c.domesticLeague?.displayName ?? null})`
    );
    await prisma.$executeRaw`
      INSERT INTO "Club" ("slug", "name", "country", "pictureUrl", "competitionSlug", "competitionName")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("slug") DO UPDATE SET
        "name"            = EXCLUDED."name",
        "country"         = EXCLUDED."country",
        "pictureUrl"      = EXCLUDED."pictureUrl",
        "competitionSlug" = EXCLUDED."competitionSlug",
        "competitionName" = EXCLUDED."competitionName"
    `;
  }

  // One statement for the whole batch rather than one per player: the database
  // is remote, and a round trip per row is what made the import time out.
  const rows = players.map((p) => {
    const injury = p.activeInjuries?.[0];
    const suspension = p.activeSuspensions?.[0];
    // Drop the nulls (games the player didn't feature in) — the sparkline and
    // averages should read actual performances, not gaps.
    const scores = (p.rawPlayerGameScores ?? []).filter((s): s is number => typeof s === "number");

    return Prisma.sql`(${p.slug}, ${p.displayName ?? p.slug}, ${p.anyPositions?.[0] ?? "Midfielder"},
      ${p.age ?? null}, ${parseDate(p.birthDate)}, ${p.shirtNumber ?? null},
      ${p.squaredPictureUrl ?? p.avatarPictureUrl ?? null}, ${p.country?.code ?? null},
      ${p.activeClub?.slug ?? null}, ${injury?.status ?? null}, ${parseDate(injury?.expectedEndDate)},
      ${Boolean(suspension)}, ${p.nextClassicFixtureProjectedScore ?? null},
      ${JSON.stringify(scores)}, ${p.lastFiveSo5Appearances ?? null},
      ${p.lastFifteenSo5Appearances ?? null}, ${p.seasonAppearances ?? null},
      ${p.avgL5 ?? null}, ${p.avgL15 ?? null}, ${p.avgL10Played ?? null}, ${now}, ${now})`;
  });

  await prisma.$executeRaw`
    INSERT INTO "Player" ("slug", "displayName", "position", "age", "birthDate", "shirtNumber",
                          "pictureUrl", "country", "clubSlug", "injuryStatus", "injuryUntil",
                          "suspended", "sorareProjection", "recentScores", "app5", "app15",
                          "seasonAppearances", "avgL5", "avgL15", "avgL10Played",
                          "enrichedAt", "updatedAt")
    VALUES ${Prisma.join(rows)}
    ON CONFLICT ("slug") DO UPDATE SET
      "displayName"       = EXCLUDED."displayName",
      "position"          = EXCLUDED."position",
      "age"               = EXCLUDED."age",
      "birthDate"         = EXCLUDED."birthDate",
      "shirtNumber"       = EXCLUDED."shirtNumber",
      "pictureUrl"        = EXCLUDED."pictureUrl",
      "country"           = EXCLUDED."country",
      "clubSlug"          = EXCLUDED."clubSlug",
      "injuryStatus"      = EXCLUDED."injuryStatus",
      "injuryUntil"       = EXCLUDED."injuryUntil",
      "suspended"         = EXCLUDED."suspended",
      "sorareProjection"  = EXCLUDED."sorareProjection",
      "recentScores"      = EXCLUDED."recentScores",
      "app5"              = EXCLUDED."app5",
      "app15"             = EXCLUDED."app15",
      "seasonAppearances" = EXCLUDED."seasonAppearances",
      "avgL5"             = EXCLUDED."avgL5",
      "avgL15"            = EXCLUDED."avgL15",
      "avgL10Played"      = EXCLUDED."avgL10Played",
      "enrichedAt"        = EXCLUDED."enrichedAt",
      "updatedAt"         = EXCLUDED."updatedAt"
  `;
}
