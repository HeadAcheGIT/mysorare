import { prisma } from "../prisma";
import { publicGraphql, PLAYERS_BY_SLUG, PLAYERS_PER_QUERY } from "../sorare/publicClient";

/**
 * Fills in everything the CSV can't: player photos, club and badge, injuries,
 * suspensions, recent So5 scores and Sorare's own projection — all from the
 * public API, no login and therefore no 2FA.
 *
 * Batched by cursor like the other syncs so a 400-player gallery fits inside
 * serverless time limits across several calls.
 */

/**
 * Players handled per HTTP call to this app. Several GraphQL queries are run
 * inside one invocation on purpose: the unauthenticated rate limit is 20
 * calls/minute, and the client's pacing only takes effect *within* an
 * invocation — one query per invocation would let the browser loop outrun the
 * limit and spend its time on 429 retries instead.
 */
export const ENRICH_BATCH_SIZE = PLAYERS_PER_QUERY * 3;

/** Leaves room under the route's 60s maxDuration for the final DB writes. */
const TIME_BUDGET_MS = 40_000;

type ApiPlayer = {
  slug: string;
  displayName: string | null;
  age: number | null;
  shirtNumber: number | null;
  anyPositions: string[] | null;
  avatarPictureUrl: string | null;
  squaredPictureUrl: string | null;
  country: { code: string | null } | null;
  activeClub: { slug: string; name: string; pictureUrl: string | null; country: { code: string | null } | null } | null;
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

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function enrichBatch(
  cursor: number
): Promise<{ processed: number; nextCursor: number | null; total: number }> {
  const players = await prisma.player.findMany({ select: { slug: true }, orderBy: { slug: "asc" } });
  const slice = players.slice(cursor, cursor + ENRICH_BATCH_SIZE);
  if (!slice.length) return { processed: 0, nextCursor: null, total: players.length };

  const started = Date.now();
  let processed = 0;

  for (let i = 0; i < slice.length; i += PLAYERS_PER_QUERY) {
    if (i > 0 && Date.now() - started > TIME_BUDGET_MS) break;
    const page = slice.slice(i, i + PLAYERS_PER_QUERY);
    await enrichPlayers(page.map((p) => p.slug));
    processed += page.length;
  }

  const nextCursor = cursor + processed < players.length ? cursor + processed : null;
  if (nextCursor === null) {
    await prisma.syncLog.create({
      data: { job: "enrich", status: "ok", detail: `${players.length} joueurs enrichis` },
    });
  }
  return { processed, nextCursor, total: players.length };
}

/** Fetches and stores one query's worth of players. */
async function enrichPlayers(slugs: string[]): Promise<void> {
  const data = await publicGraphql<{ players: ApiPlayer[] }>(PLAYERS_BY_SLUG, { slugs });

  for (const p of data.players ?? []) {
    if (!p?.slug) continue;

    const club = p.activeClub;
    if (club?.slug) {
      await prisma.club.upsert({
        where: { slug: club.slug },
        create: {
          slug: club.slug,
          name: club.name ?? club.slug,
          country: club.country?.code ?? null,
          pictureUrl: club.pictureUrl ?? null,
        },
        update: {
          name: club.name ?? club.slug,
          country: club.country?.code ?? null,
          pictureUrl: club.pictureUrl ?? null,
        },
      });
    }

    const injury = p.activeInjuries?.[0];
    const suspension = p.activeSuspensions?.[0];
    // Drop the nulls (games the player didn't feature in) — the sparkline and
    // averages should read actual performances, not gaps.
    const scores = (p.rawPlayerGameScores ?? []).filter((s): s is number => typeof s === "number");

    await prisma.player.update({
      where: { slug: p.slug },
      data: {
        displayName: p.displayName ?? undefined,
        age: p.age ?? undefined,
        shirtNumber: p.shirtNumber ?? null,
        position: p.anyPositions?.[0] ?? undefined,
        pictureUrl: p.squaredPictureUrl ?? p.avatarPictureUrl ?? null,
        country: p.country?.code ?? null,
        clubSlug: club?.slug ?? null,
        injuryStatus: injury?.status ?? null,
        injuryUntil: parseDate(injury?.expectedEndDate),
        suspended: Boolean(suspension),
        sorareProjection: p.nextClassicFixtureProjectedScore ?? null,
        recentScores: JSON.stringify(scores),
        app5: p.lastFiveSo5Appearances ?? null,
        app15: p.lastFifteenSo5Appearances ?? null,
        seasonAppearances: p.seasonAppearances ?? null,
        avgL5: p.avgL5 ?? null,
        avgL15: p.avgL15 ?? null,
        avgL10Played: p.avgL10Played ?? null,
        enrichedAt: new Date(),
      },
    });
  }
}
