import { prisma } from "../prisma";
import { parseScores } from "./squadView";
import { trend } from "./insights";

/**
 * Two situational signals for the Mercato tab, on top of the transfer-rumor
 * alerts already computed by lib/services/alerts.ts: is a player's starting
 * time trending up or down, and is their scoring form trending up. Both are
 * read from data this app already computes and stores weekly — nothing new
 * is fetched from Sorare or any external source.
 *
 * Deliberately not attempting to guess a transfer's *destination* (new club,
 * new league, new competition for playing time): the headline classifier in
 * transferStage.ts has no player-name-entity-resolution step, so there is no
 * reliable way to know which club a rumoured move is to. Claiming otherwise
 * would be exactly the kind of confident nonsense this app avoids elsewhere
 * (see squadView.ts's "unenriched" guard). What's shown instead is honest:
 * a transfer story exists (see alerts.ts), and separately, this player's own
 * situation — at their *current* club — is trending a certain way.
 */

export interface StartTrend {
  direction: "up" | "down";
  /** Rounded 0-100, average pStart over the most recent fixtures. */
  recentPct: number;
  /** Rounded 0-100, average pStart over the fixtures before that. */
  priorPct: number;
  /** recentAvg - olderAvg, 0..1, unrounded — used to rank severity. */
  delta: number;
}

export interface FormTrend {
  /** Points gained, last 3 games vs the 4 before — same rule as insights.ts's "rising" group. */
  delta: number;
}

export interface MercatoSignalRow {
  startTrend: StartTrend | null;
  formTrend: FormTrend | null;
}

const START_TREND_RECENT_WINDOW = 2;
const START_TREND_PRIOR_WINDOW = 3;
/** 20 points of starting probability — a real shift, not week-to-week model jitter. */
const START_TREND_THRESHOLD = 0.2;
/** Same bar insights.ts uses for its "rising" group — one definition of "trending up". */
const FORM_TREND_THRESHOLD = 12;

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Pure classifier: given a player's pStart across their recent fixtures,
 * newest first, is their starting time trending up or down enough to matter.
 *
 * Needs 5 data points (2 recent + 3 prior) before it says anything — early
 * season, or a player with a thin projection history, simply gets no signal
 * rather than a trend computed from noise.
 */
export function classifyStartTrend(pStartsNewestFirst: number[]): StartTrend | null {
  const need = START_TREND_RECENT_WINDOW + START_TREND_PRIOR_WINDOW;
  if (pStartsNewestFirst.length < need) return null;
  const recent = avg(pStartsNewestFirst.slice(0, START_TREND_RECENT_WINDOW));
  const older = avg(pStartsNewestFirst.slice(START_TREND_RECENT_WINDOW, need));
  const delta = recent - older;
  if (Math.abs(delta) < START_TREND_THRESHOLD) return null;
  return {
    direction: delta > 0 ? "up" : "down",
    recentPct: Math.round(recent * 100),
    priorPct: Math.round(older * 100),
    delta,
  };
}

/** Pure classifier: reuses insights.ts's trend() rule, upside only — this tab never claims a player's form is *worsening*, only that it's improving. */
export function classifyFormTrend(scoresNewestFirst: number[]): FormTrend | null {
  const t = trend(scoresNewestFirst);
  if (t == null || t < FORM_TREND_THRESHOLD) return null;
  return { delta: Math.round(t) };
}

/**
 * One row per owned player (never the whole market), keyed by playerSlug —
 * sparse: a player with neither signal simply has no entry.
 */
export async function buildMercatoSignals(): Promise<Record<string, MercatoSignalRow>> {
  const cards = await prisma.card.findMany({ select: { playerSlug: true } });
  const slugs = [...new Set(cards.map((c) => c.playerSlug))];
  if (!slugs.length) return {};

  const [players, projections] = await Promise.all([
    prisma.player.findMany({
      where: { slug: { in: slugs } },
      select: { slug: true, recentScores: true, injuryStatus: true, suspended: true },
    }),
    prisma.projection.findMany({
      where: { playerSlug: { in: slugs } },
      select: { playerSlug: true, fixtureSlug: true, pStart: true },
    }),
  ]);

  const fixtureSlugs = [...new Set(projections.map((p) => p.fixtureSlug))];
  const fixtures = fixtureSlugs.length
    ? await prisma.fixture.findMany({
        where: { slug: { in: fixtureSlugs } },
        select: { slug: true, startDate: true, gameWeek: true },
      })
    : [];
  // Chronological order within a player's own projection history — startDate
  // when known (set on every synced fixture, see gameweek.ts), gameWeek as a
  // fallback for the rare row predating that sync.
  const fixtureOrder = new Map(fixtures.map((f) => [f.slug, f.startDate?.getTime() ?? f.gameWeek ?? 0]));

  const byPlayer = new Map<string, { pStart: number; order: number }[]>();
  for (const p of projections) {
    const list = byPlayer.get(p.playerSlug) ?? [];
    list.push({ pStart: p.pStart, order: fixtureOrder.get(p.fixtureSlug) ?? 0 });
    byPlayer.set(p.playerSlug, list);
  }

  const out: Record<string, MercatoSignalRow> = {};
  for (const p of players) {
    const rows = (byPlayer.get(p.slug) ?? []).sort((a, b) => b.order - a.order);
    // A currently injured/suspended player's latest pStart is forced to 0 by
    // the projection model (see computeForm in projections.ts) — that would
    // read as "losing his starting spot" when it's actually just this week's
    // injury, already flagged elsewhere. Skip rather than double up on it.
    const startTrend =
      p.injuryStatus || p.suspended ? null : classifyStartTrend(rows.map((r) => r.pStart));
    const formTrend = classifyFormTrend(parseScores(p.recentScores));
    if (startTrend || formTrend) out[p.slug] = { startTrend, formTrend };
  }
  return out;
}
