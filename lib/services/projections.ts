/**
 * Turns appearance history into a starting probability and an expected score.
 *
 * No public feed gives Sorare-grade probable line-ups, so this builds its own
 * signal from what the API exposes:
 *
 *   p(start) = recency-weighted share of recent games started, shrunk toward
 *              the position baseline when the sample is thin, zeroed out for
 *              an active injury or suspension.
 *
 *   expected = p(start) * mean(score when starting)
 *            + (1 - p(start)) * mean(score off the bench)
 *              scaled by the card's bonus and by games-in-week.
 *
 * A human read always wins: see Override in the Prisma schema.
 */
import { config, POSITION_BASELINE, PRIOR_WEIGHT } from "../config";

export interface AppearanceLike {
  minutes: number;
  started: boolean;
  score: number | null;
  /**
   * Place in the starting formation, when known. Non-zero means the player was
   * in the starting XI; 0 means bench. Null for rows from a source that
   * doesn't carry it, where the minutes heuristic is the only option left.
   */
  formationPlace?: number | null;
}

export interface Form {
  pStart: number;
  /** Probability of appearing at all — a substitute still scores, so this is what expected leans on. */
  pPlay: number;
  /** "starts" when real starting-XI data backed pStart, "appearances" when only minutes did. */
  pStartBasis: "starts" | "appearances" | "baseline";
  expected: number;
  floor: number;
  l5: number | null;
  l15: number | null;
  note: string;
}

/**
 * Trusts formationPlace when it's there and only then falls back to minutes.
 *
 * The previous rule OR-ed the two, which promoted any substitute who happened
 * to play an hour into a "starter" and so inflated every rotation player's
 * starting probability.
 */
export function startedFrom(a: AppearanceLike): boolean {
  if (a.formationPlace != null) return a.formationPlace > 0;
  return a.started || a.minutes >= config.startMinutesThreshold;
}

function weight(rank: number): number {
  // Most recent game has rank 0. Halves in influence every `recencyHalflife` games.
  return 0.5 ** (rank / config.recencyHalflife);
}

export function computeForm(
  appearancesNewestFirst: AppearanceLike[],
  position: string,
  injured: boolean,
  suspended: boolean,
  gamesInWeek: number,
  cardBonus: number
): Form {
  const base = POSITION_BASELINE[position] ?? POSITION_BASELINE.Midfielder;
  const notes: string[] = [];

  if (appearancesNewestFirst.length === 0) {
    const p = base.pStart * 0.6;
    const expected = (p * base.start + (1 - p) * base.bench) * (1 + cardBonus) * gamesInWeek;
    return {
      pStart: p,
      pPlay: p,
      pStartBasis: "baseline",
      expected: round(expected),
      floor: round(base.bench * (1 + cardBonus)),
      l5: null,
      l15: null,
      note: "No history — position baseline only",
    };
  }

  const window = appearancesNewestFirst.slice(0, config.formWindow);
  let wTotal = 0;
  let wStart = 0;
  let wPlay = 0;
  const startScores: [number, number][] = [];
  const benchScores: [number, number][] = [];

  window.forEach((a, rank) => {
    const w = weight(rank);
    wTotal += w;
    if (a.minutes > 0) wPlay += w;
    if (startedFrom(a)) {
      wStart += w;
      if (a.score != null) startScores.push([w, a.score]);
    } else if (a.score != null) {
      benchScores.push([w, a.score]);
    }
  });

  const rawP = wTotal ? wStart / wTotal : base.pStart;
  let pStart = (wStart + PRIOR_WEIGHT * base.pStart) / (wTotal + PRIOR_WEIGHT);
  let pPlay = (wPlay + PRIOR_WEIGHT * base.pStart) / (wTotal + PRIOR_WEIGHT);
  const pStartBasis = window.some((a) => a.formationPlace != null) ? "starts" : "appearances";

  const wmean = (pairs: [number, number][], fallback: number) => {
    if (!pairs.length) return fallback;
    const num = pairs.reduce((s, [w, v]) => s + w * v, 0);
    const den = pairs.reduce((s, [w]) => s + w, 0);
    return (num + PRIOR_WEIGHT * fallback) / (den + PRIOR_WEIGHT);
  };

  const muStart = wmean(startScores, base.start);
  const muBench = wmean(benchScores, base.bench);

  if (injured) {
    pStart = 0;
    pPlay = 0;
    notes.push("Injured — excluded from the model");
  }
  if (suspended) {
    pStart = 0;
    pPlay = 0;
    notes.push("Suspended");
  }
  // Starting implies playing; a thin start sample against a longer appearance
  // record must never invert the two.
  pStart = Math.min(pStart, pPlay);
  if (pStart > 0 && window.length < 5) notes.push(`Thin sample (${window.length} games)`);
  if (rawP > 0.85 && pStart < rawP) notes.push("Nailed-on starter, shrunk for sample size");

  let expected = pStart * muStart + (1 - pStart) * muBench;
  expected *= 1 + cardBonus;
  expected *= gamesInWeek;
  const floor = muBench * (1 + cardBonus);

  const recent = window.map((a) => a.score).filter((s): s is number => s != null);
  const l5 = recent.slice(0, 5).length ? avg(recent.slice(0, 5)) : null;
  const l15 = recent.slice(0, 15).length ? avg(recent.slice(0, 15)) : null;

  return {
    pStart: round(pStart, 3),
    pPlay: round(pPlay, 3),
    pStartBasis,
    expected: round(expected),
    floor: round(floor),
    l5: l5 != null ? round(l5) : null,
    l15: l15 != null ? round(l15) : null,
    note: notes.join(" · "),
  };
}

function avg(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function round(v: number, dp = 2) {
  const m = 10 ** dp;
  return Math.round(v * m) / m;
}
