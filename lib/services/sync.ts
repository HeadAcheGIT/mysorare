/**
 * Serverless functions have a hard wall-clock limit per invocation (10s on
 * Vercel Hobby by default). Squad + fixtures fit in one or two GraphQL calls,
 * so `syncSquadAndFixtures` runs as a single request. Refreshing form is one
 * API call per player, which for any real squad won't fit in one invocation —
 * so it's chunked: `syncFormBatch` processes a handful of players per call
 * and returns a cursor, and the client (or the cron route) loops until done.
 */
import { prisma } from "../prisma";
import { graphql, paginate } from "../sorare/client";
import { MY_CARDS, OPEN_FIXTURES, PLAYER_FORM } from "../sorare/queries";
import { computeForm } from "./projections";
import { aggregateSources, congestionReading, type SourceReading } from "./sourceAggregation";
import * as apiFootball from "./apiFootball";
import { currentFixture } from "./squadView";

export const FORM_BATCH_SIZE = 6; // ~6 * pacing delay stays well under a 10s function timeout

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof v === "number") return new Date(v * 1000);
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function syncSquadAndFixtures(): Promise<{ cards: number; fixture: string | null }> {
  let count = 0;
  for await (const node of paginate<any>(MY_CARDS, {}, ["currentUser", "cards"], 50)) {
    const p = node.anyPlayer;
    if (!p?.slug) continue;

    const club = p.activeClub;
    if (club?.slug) {
      await prisma.club.upsert({
        where: { slug: club.slug },
        create: { slug: club.slug, name: club.name ?? club.slug, country: club.country?.code ?? null },
        update: { name: club.name ?? club.slug, country: club.country?.code ?? null },
      });
    }

    const injuries = p.activeInjuries ?? [];
    await prisma.player.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        displayName: p.displayName ?? p.slug,
        position: p.anyPositions?.[0] ?? "Midfielder",
        age: p.age ?? null,
        clubSlug: club?.slug ?? null,
        injuryStatus: injuries[0]?.status ?? null,
        injuryUntil: parseDate(injuries[0]?.expectedEndDate),
      },
      update: {
        displayName: p.displayName ?? p.slug,
        position: p.anyPositions?.[0] ?? "Midfielder",
        age: p.age ?? null,
        clubSlug: club?.slug ?? null,
        injuryStatus: injuries[0]?.status ?? null,
        injuryUntil: parseDate(injuries[0]?.expectedEndDate),
      },
    });

    const power = node.power;
    const bonus = power ? (Number(power) > 1 ? Number(power) / 100 : Number(power)) : 0;
    await prisma.card.upsert({
      where: { slug: node.slug },
      create: {
        slug: node.slug,
        assetId: node.assetId ?? null,
        playerSlug: p.slug,
        rarity: (node.rarityTyped ?? "limited").toLowerCase(),
        season: node.seasonYear ?? null,
        inSeason: Boolean(node.inSeasonEligible),
        serialNumber: node.serialNumber ?? null,
        bonus,
      },
      update: {
        assetId: node.assetId ?? null,
        rarity: (node.rarityTyped ?? "limited").toLowerCase(),
        season: node.seasonYear ?? null,
        inSeason: Boolean(node.inSeasonEligible),
        serialNumber: node.serialNumber ?? null,
        bonus,
      },
    });
    count++;
  }

  const fixtureData = await graphql<any>(OPEN_FIXTURES);
  const nodes = fixtureData?.so5?.so5Fixtures?.nodes ?? [];
  let current: string | null = null;
  for (const n of nodes) {
    await prisma.fixture.upsert({
      where: { slug: n.slug },
      create: {
        slug: n.slug,
        startDate: parseDate(n.startDate),
        endDate: parseDate(n.endDate),
        state: n.aasmState ?? null,
      },
      update: { startDate: parseDate(n.startDate), endDate: parseDate(n.endDate), state: n.aasmState ?? null },
    });
    if (!current && ["opened", "open", "started"].includes(n.aasmState)) current = n.slug;
  }
  current = current ?? nodes[0]?.slug ?? null;

  await prisma.syncLog.create({ data: { job: "squad", status: "ok", detail: `${count} cards, fixture ${current}` } });
  return { cards: count, fixture: current };
}

/** Processes up to FORM_BATCH_SIZE players starting at `cursor` (offset into an alphabetised slug list). */
export async function syncFormBatch(
  cursor: number
): Promise<{ processed: number; nextCursor: number | null; total: number }> {
  const allPlayers = await prisma.player.findMany({ select: { slug: true }, orderBy: { slug: "asc" } });
  const slice = allPlayers.slice(cursor, cursor + FORM_BATCH_SIZE);

  for (const { slug } of slice) {
    try {
      const data = await graphql<any>(PLAYER_FORM, { slug, last: 15 });
      const scores = data?.anyPlayer?.allPlayerGameScores?.nodes ?? [];
      for (const entry of scores) {
        const stats = entry.anyPlayerGameStats;
        const game = entry.anyGame;
        if (!game?.id) continue;
        const minutes = stats.minsPlayed ?? 0;
        await prisma.appearance.upsert({
          where: { playerSlug_gameId: { playerSlug: slug, gameId: game.id } },
          create: {
            playerSlug: slug,
            gameId: game.id,
            gameDate: parseDate(game.date),
            competition: game.competition?.displayName ?? null,
            minutes,
            started: minutes >= 60,
            onGameSheet: Boolean(stats.onGameSheet),
            score: entry.score ?? null,
          },
          update: {
            gameDate: parseDate(game.date),
            competition: game.competition?.displayName ?? null,
            minutes,
            started: minutes >= 60,
            onGameSheet: Boolean(stats.onGameSheet),
            score: entry.score ?? null,
          },
        });
      }
    } catch (err) {
      await prisma.syncLog.create({
        data: { job: "form", status: "error", detail: `${slug}: ${(err as Error).message}`.slice(0, 2000) },
      });
    }
  }

  const nextCursor = cursor + slice.length < allPlayers.length ? cursor + slice.length : null;
  if (nextCursor === null) {
    await prisma.syncLog.create({ data: { job: "form", status: "ok", detail: `completed, ${allPlayers.length} players` } });
  }
  return { processed: slice.length, nextCursor, total: allPlayers.length };
}

/** Combines the internal form model with the other available sources, writes
 *  each source's individual reading (so disagreements are inspectable later),
 *  and stores the aggregate on Projection. No API calls — safe to re-run
 *  after an override edit. */
export async function recomputeProjections(fixtureSlug: string): Promise<number> {
  const players = await prisma.player.findMany();
  const cards = await prisma.card.findMany();
  const cardByPlayer = new Map(cards.map((c) => [c.playerSlug, c]));
  const now = new Date();
  let written = 0;

  for (const player of players) {
    const appearances = await prisma.appearance.findMany({
      where: { playerSlug: player.slug },
      orderBy: { gameDate: "desc" },
      take: 15,
    });
    const injured = Boolean(player.injuryStatus && (!player.injuryUntil || player.injuryUntil > now));
    const card = cardByPlayer.get(player.slug);

    const form = computeForm(
      appearances.map((a) => ({ minutes: a.minutes, started: a.started, score: a.score })),
      player.position,
      injured,
      player.suspended,
      1,
      card?.bonus ?? 0
    );

    const readings: SourceReading[] = [
      { source: "internal_form", pStart: form.pStart, weight: 1.0, detail: form.note || undefined },
      congestionReading(appearances, now),
      // Not implemented — see sourceAggregation.ts for why. Written so the
      // schema/UI already has a slot if a real data source gets plugged in.
      { source: "squad_depth", pStart: null, weight: 0.6, detail: "Not available — needs full club roster data" },
    ];
    if (injured || player.suspended) {
      readings.unshift({
        source: "injury_status",
        pStart: 0,
        weight: 3,
        detail: player.suspended ? "Suspended" : `Injured (${player.injuryStatus})`,
      });
    }

    // external_probable is a single slot: either a confirmed official lineup
    // fetched by checkConfirmedLineups (a fact, weighted heavily), or — most
    // of the time, since that's only available ~30 min pre-kickoff — the
    // "not checked yet" placeholder. Never both, so there's exactly one
    // upsert per source per player and no race on the unique key below.
    const confirmedRow = await prisma.projectionSource.findUnique({
      where: { playerSlug_fixtureSlug_source: { playerSlug: player.slug, fixtureSlug, source: "external_probable" } },
    });
    readings.push(
      confirmedRow?.pStart != null
        ? { source: "external_probable", pStart: confirmedRow.pStart, weight: confirmedRow.weight, detail: confirmedRow.detail ?? undefined }
        : { source: "external_probable", pStart: null, weight: 1.5, detail: "Not checked yet — official lineup only appears ~30 min pre-kickoff" }
    );

    const agg = aggregateSources(readings);

    await Promise.all(
      readings.map((r) =>
        prisma.projectionSource.upsert({
          where: { playerSlug_fixtureSlug_source: { playerSlug: player.slug, fixtureSlug, source: r.source } },
          create: {
            playerSlug: player.slug,
            fixtureSlug,
            source: r.source,
            pStart: r.pStart,
            weight: r.weight,
            detail: r.detail ?? null,
          },
          update: { pStart: r.pStart, weight: r.weight, detail: r.detail ?? null, fetchedAt: now },
        })
      )
    );

    await prisma.projection.upsert({
      where: { playerSlug_fixtureSlug: { playerSlug: player.slug, fixtureSlug } },
      create: {
        playerSlug: player.slug,
        fixtureSlug,
        pStart: agg.pStart,
        confidence: agg.confidence,
        expectedScore: form.expected,
        floorScore: form.floor,
        l5: form.l5,
        l15: form.l15,
        note: agg.note,
        sorareStarterOdds: player.sorareStarterOdds,
        sorareOddsProviderName: player.sorareOddsProviderName,
      },
      update: {
        pStart: agg.pStart,
        confidence: agg.confidence,
        expectedScore: form.expected,
        floorScore: form.floor,
        l5: form.l5,
        l15: form.l15,
        note: agg.note,
        computedAt: now,
        sorareStarterOdds: player.sorareStarterOdds,
        sorareOddsProviderName: player.sorareOddsProviderName,
      },
    });
    written++;
  }

  await prisma.syncLog.create({ data: { job: "projections", status: "ok", detail: `${written} players` } });
  return written;
}

/**
 * Checks official confirmed lineups via API-Football, club by club, for
 * players whose next match kicks off soon. Only useful in roughly the
 * 40-minute window before kickoff — call this from the app right before
 * your Sorare line-up locks, not hours ahead (see apiFootball.ts for why).
 * Batched to respect the free tier's 100 requests/day: each call processes
 * a handful of clubs and returns a cursor, same pattern as syncFormBatch.
 */
const LINEUP_CHECK_BATCH = 5;
const LINEUP_CHECK_WINDOW_MIN = 90; // start trying once kickoff is this close

export async function checkConfirmedLineups(
  cursor: number
): Promise<{ processed: number; nextCursor: number | null; total: number; found: number }> {
  const players = await prisma.player.findMany({
    where: { clubSlug: { not: null } },
    include: { club: true },
    orderBy: { slug: "asc" },
  });
  // Group by club so we make one /fixtures and one /fixtures/lineups call per club, not per player.
  const byClub = new Map<string, typeof players>();
  for (const p of players) {
    if (!p.clubSlug) continue;
    if (!byClub.has(p.clubSlug)) byClub.set(p.clubSlug, []);
    byClub.get(p.clubSlug)!.push(p);
  }
  const clubSlugs = [...byClub.keys()];
  const slice = clubSlugs.slice(cursor, cursor + LINEUP_CHECK_BATCH);
  const now = new Date();
  let found = 0;

  for (const clubSlug of slice) {
    const roster = byClub.get(clubSlug)!;
    const club = roster[0].club;
    if (!club) continue;

    try {
      const teamId = await apiFootball.resolveTeamId(clubSlug, club.name);
      if (!teamId) continue;

      const next = await apiFootball.nextFixture(teamId);
      if (!next) continue;
      const minutesToKickoff = (next.kickoff.getTime() - now.getTime()) / 60000;
      if (minutesToKickoff > LINEUP_CHECK_WINDOW_MIN || minutesToKickoff < -15) continue; // not soon, or already well underway

      const lineup = await apiFootball.confirmedLineup(next.fixtureId);
      if (!lineup.confirmed) continue;

      const currentFix = await currentFixture();
      if (!currentFix) continue;

      for (const player of roster) {
        const apiId = await apiFootball.resolvePlayerId(player.slug, player.displayName, teamId);
        if (!apiId) continue;
        const starting = lineup.startingIds.has(apiId);
        await prisma.projectionSource.upsert({
          where: { playerSlug_fixtureSlug_source: { playerSlug: player.slug, fixtureSlug: currentFix, source: "external_probable" } },
          create: {
            playerSlug: player.slug,
            fixtureSlug: currentFix,
            source: "external_probable",
            pStart: starting ? 1 : 0.05,
            weight: 5, // it's a fact, not a forecast — dominates the aggregate
            detail: starting ? "Confirmed starter (API-Football)" : "Confirmed NOT starting (API-Football)",
          },
          update: {
            pStart: starting ? 1 : 0.05,
            weight: 5,
            detail: starting ? "Confirmed starter (API-Football)" : "Confirmed NOT starting (API-Football)",
            fetchedAt: now,
          },
        });
        found++;
      }
    } catch (err) {
      await prisma.syncLog.create({
        data: { job: "lineup_check", status: "error", detail: `${clubSlug}: ${(err as Error).message}`.slice(0, 2000) },
      });
    }
  }

  const nextCursor = cursor + slice.length < clubSlugs.length ? cursor + slice.length : null;
  await prisma.syncLog.create({
    data: { job: "lineup_check", status: "ok", detail: `${slice.length} clubs checked, ${found} lineups confirmed` },
  });
  return { processed: slice.length, nextCursor, total: clubSlugs.length, found };
}
