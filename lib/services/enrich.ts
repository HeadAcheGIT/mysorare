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
  /** Batches that errored out — a query-level bug (bad field, schema drift) fails every page identically. */
  failed: number;
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
    domesticLeagueRanking: number | null;
    domesticLeague: { slug: string; displayName: string } | null;
  } | null;
  activeInjuries: { status: string | null; expectedEndDate: string | null }[] | null;
  activeSuspensions: { reason: string | null; endDate: string | null }[] | null;
  nextClassicFixtureProjectedScore: number | null;
  nextClassicFixturePlayingStatusOdds: {
    starterOddsBasisPoints: number | null;
    reliability: string | null;
    providerIconUrl: string | null;
    providerRedirectUrl: string | null;
  } | null;
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

/**
 * The odds API gives an icon/redirect URL for its data partner but no plain
 * name — derived from the redirect host as a readable fallback label (the
 * icon itself is the primary "who is this" signal in the UI).
 */
export function providerNameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const base = host.split(".")[0];
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : null;
  } catch {
    return null;
  }
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
    return { processed: 0, remaining: 0, total, neverEnriched: neverEnrichedBefore, failed: 0 };
  }

  const started = Date.now();
  let processed = 0;
  let failed = 0;
  let lastError: string | null = null;
  for (let i = 0; i < due.length; i += PLAYERS_PER_QUERY) {
    if (i > 0 && Date.now() - started > TIME_BUDGET_MS) break;
    const page = due.slice(i, i + PLAYERS_PER_QUERY);
    // One page failing (a schema drift, a transient 5xx, one malformed slug)
    // must not sink every other page in the batch — that turned a single bad
    // field name into a silent, total enrichment outage for hours, since
    // nothing else surfaced the failure anywhere a user would see it.
    try {
      await enrichPlayers(page.map((p) => p.slug));
      processed += page.length;
    } catch (err) {
      failed++;
      lastError = err instanceof Error ? err.message : String(err);
      console.error("[enrich] batch failed:", lastError);
    }
  }

  const [remaining, neverEnriched] = await Promise.all([
    prisma.player.count({ where: { OR: [{ enrichedAt: null }, { enrichedAt: { lt: staleBefore } }] } }),
    prisma.player.count({ where: { enrichedAt: null } }),
  ]);

  if (failed > 0) {
    // Visible in the Données tab's Journal — the whole point is that this
    // used to fail with nothing to see there at all.
    await prisma.syncLog.create({
      data: { job: "enrich", status: "error", detail: `${failed} lot(s) en échec : ${lastError}` },
    });
  } else if (remaining === 0) {
    await prisma.syncLog.create({
      data: { job: "enrich", status: "ok", detail: `${total} joueurs enrichis` },
    });
  }
  return { processed, remaining, total, neverEnriched, failed };
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
          ${c.domesticLeague?.slug ?? null}, ${c.domesticLeague?.displayName ?? null},
          ${c.domesticLeagueRanking ?? null})`
    );
    await prisma.$executeRaw`
      INSERT INTO "Club" ("slug", "name", "country", "pictureUrl", "competitionSlug", "competitionName",
                          "leagueRanking")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("slug") DO UPDATE SET
        "name"            = EXCLUDED."name",
        "country"         = EXCLUDED."country",
        "pictureUrl"      = EXCLUDED."pictureUrl",
        "competitionSlug" = EXCLUDED."competitionSlug",
        "competitionName" = EXCLUDED."competitionName",
        "leagueRanking"   = EXCLUDED."leagueRanking"
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
    const odds = p.nextClassicFixturePlayingStatusOdds;
    const starterOdds = odds?.starterOddsBasisPoints != null ? odds.starterOddsBasisPoints / 10000 : null;

    return Prisma.sql`(${p.slug}, ${p.displayName ?? p.slug}, ${p.anyPositions?.[0] ?? "Midfielder"},
      ${p.age ?? null}, ${parseDate(p.birthDate)}, ${p.shirtNumber ?? null},
      ${p.squaredPictureUrl ?? p.avatarPictureUrl ?? null}, ${p.country?.code ?? null},
      ${p.activeClub?.slug ?? null}, ${injury?.status ?? null}, ${parseDate(injury?.expectedEndDate)},
      ${Boolean(suspension)}, ${p.nextClassicFixtureProjectedScore ?? null},
      ${starterOdds}, ${providerNameFromUrl(odds?.providerRedirectUrl)}, ${odds?.providerIconUrl ?? null},
      ${odds?.reliability ?? null},
      ${JSON.stringify(scores)}, ${p.lastFiveSo5Appearances ?? null},
      ${p.lastFifteenSo5Appearances ?? null}, ${p.seasonAppearances ?? null},
      ${p.avgL5 ?? null}, ${p.avgL15 ?? null}, ${p.avgL10Played ?? null}, ${now}, ${now})`;
  });

  await prisma.$executeRaw`
    INSERT INTO "Player" ("slug", "displayName", "position", "age", "birthDate", "shirtNumber",
                          "pictureUrl", "country", "clubSlug", "injuryStatus", "injuryUntil",
                          "suspended", "sorareProjection",
                          "sorareStarterOdds", "sorareOddsProviderName", "sorareOddsProviderIconUrl",
                          "sorareOddsReliability",
                          "recentScores", "app5", "app15",
                          "seasonAppearances", "avgL5", "avgL15", "avgL10Played",
                          "enrichedAt", "updatedAt")
    VALUES ${Prisma.join(rows)}
    ON CONFLICT ("slug") DO UPDATE SET
      "displayName"               = EXCLUDED."displayName",
      "position"                  = EXCLUDED."position",
      "age"                       = EXCLUDED."age",
      "birthDate"                 = EXCLUDED."birthDate",
      "shirtNumber"               = EXCLUDED."shirtNumber",
      "pictureUrl"                = EXCLUDED."pictureUrl",
      "country"                   = EXCLUDED."country",
      "clubSlug"                  = EXCLUDED."clubSlug",
      "injuryStatus"              = EXCLUDED."injuryStatus",
      "injuryUntil"               = EXCLUDED."injuryUntil",
      "suspended"                 = EXCLUDED."suspended",
      "sorareProjection"          = EXCLUDED."sorareProjection",
      "sorareStarterOdds"         = EXCLUDED."sorareStarterOdds",
      "sorareOddsProviderName"    = EXCLUDED."sorareOddsProviderName",
      "sorareOddsProviderIconUrl" = EXCLUDED."sorareOddsProviderIconUrl",
      "sorareOddsReliability"     = EXCLUDED."sorareOddsReliability",
      "recentScores"              = EXCLUDED."recentScores",
      "app5"                      = EXCLUDED."app5",
      "app15"                     = EXCLUDED."app15",
      "seasonAppearances"         = EXCLUDED."seasonAppearances",
      "avgL5"                     = EXCLUDED."avgL5",
      "avgL15"                    = EXCLUDED."avgL15",
      "avgL10Played"              = EXCLUDED."avgL10Played",
      "enrichedAt"                = EXCLUDED."enrichedAt",
      "updatedAt"                 = EXCLUDED."updatedAt"
  `;
}
