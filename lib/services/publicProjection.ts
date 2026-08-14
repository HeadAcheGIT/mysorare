import { POSITION_BASELINE, PRIOR_WEIGHT } from "../config";

/**
 * Projection built purely from what Sorare's *public* API exposes, so it works
 * straight after a CSV import with no login.
 *
 * The authenticated model (projections.ts) works from per-game minutes, which
 * the public API doesn't give. What it does give is appearance counts over the
 * club's last 5 and 15 games, which is the same signal at lower resolution:
 *
 *   p(play) = appearances / games, blending the 5-game and 15-game windows so
 *             a single rotation doesn't swing it, shrunk toward the position
 *             baseline when the sample is thin, and zeroed by injury or
 *             suspension.
 *
 *   expected = p(play) × (how well he scores when he plays)
 *
 * "When he plays" matters: avgL10Played only counts games actually played, so
 * multiplying it by p(play) doesn't double-count absences the way multiplying
 * a blended average would.
 */

export type PStartBasis = "starts" | "appearances" | "baseline";

export interface PublicForm {
  /** Probability of being in the starting XI. */
  pStart: number;
  /** Probability of appearing at all, starter or substitute — what drives `expected`. */
  pPlay: number;
  /** What pStart is actually built from, so the UI can label it truthfully. */
  pStartBasis: PStartBasis;
  expected: number;
  floor: number;
  l5: number | null;
  l15: number | null;
  confidence: number;
  note: string;
}

export interface PublicInput {
  position: string;
  app5: number | null;
  app15: number | null;
  avgL5: number | null;
  avgL15: number | null;
  avgL10Played: number | null;
  sorareProjection: number | null;
  recentScores: number[];
  injured: boolean;
  suspended: boolean;
  hasClub: boolean;
  cardBonus: number;
  /**
   * Real starting-XI rate from per-game history (Appearance.formationPlace),
   * recency-weighted by the caller, with the number of games behind it.
   *
   * When present this is what pStart is built from. Without it the appearance
   * counts are all there is, and they cannot tell a starter from a substitute
   * — a one-minute cameo counts as a full appearance — so pStart falls back to
   * p(plays) and says so via pStartBasis rather than pretending.
   */
  startRate?: number | null;
  startSample?: number;
}

const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Starting rate over recent games, newest first, with older games counting
 * for less — a player who started the last three matches after a spell on the
 * bench is a starter now, and a flat average would take weeks to say so.
 *
 * `halflife` is in games: a match that far back counts half as much as the
 * most recent one.
 */
export function recencyWeightedStartRate(
  games: { started: boolean }[],
  halflife = 5
): { rate: number; sample: number } | null {
  if (!games.length) return null;

  let weighted = 0;
  let total = 0;
  games.forEach((g, i) => {
    const w = Math.pow(0.5, i / halflife);
    total += w;
    if (g.started) weighted += w;
  });

  return { rate: total > 0 ? weighted / total : 0, sample: games.length };
}

export function projectFromPublic(input: PublicInput): PublicForm {
  const base = POSITION_BASELINE[input.position] ?? POSITION_BASELINE.Midfielder;
  const notes: string[] = [];

  const unavailable = (note: string, confidence: number): PublicForm => ({
    pStart: 0,
    pPlay: 0,
    pStartBasis: "baseline",
    expected: 0,
    floor: 0,
    l5: input.avgL5,
    l15: input.avgL15,
    confidence,
    note,
  });

  if (!input.hasClub) return unavailable("Sans club — ne peut pas marquer", 0.9);
  if (input.injured || input.suspended) {
    return unavailable(input.suspended ? "Suspendu" : "Blessé", 0.95);
  }

  // Recent form is the better predictor, but 5 games is noisy — weight it
  // ahead of the 15-game window without letting it dominate.
  const rate5 = input.app5 != null ? clamp01(input.app5 / 5) : null;
  const rate15 = input.app15 != null ? clamp01(input.app15 / 15) : null;

  let observedPlay: number | null = null;
  let sampleGames = 0;
  if (rate5 != null && rate15 != null) {
    observedPlay = 0.65 * rate5 + 0.35 * rate15;
    sampleGames = 15;
  } else if (rate5 != null) {
    observedPlay = rate5;
    sampleGames = 5;
  } else if (rate15 != null) {
    observedPlay = rate15;
    sampleGames = 15;
  }

  const shrink = (observed: number, games: number, prior: number) =>
    (observed * games + prior * PRIOR_WEIGHT) / (games + PRIOR_WEIGHT);

  // p(plays at all) — what the appearance counts genuinely measure.
  let pPlay: number;
  if (observedPlay == null) {
    pPlay = base.pStart * 0.6;
    notes.push("Aucune donnée de temps de jeu");
  } else {
    pPlay = shrink(observedPlay, sampleGames, base.pStart);
    if (sampleGames <= 5) notes.push("Échantillon réduit");
  }

  // p(starts) — real per-game starting data when we have it. Falling back to
  // pPlay is a deliberate over-estimate rather than a guess dressed up as
  // fact: pStartBasis carries which one this is so nothing downstream can
  // silently read "titulaire" off an appearance rate.
  let pStart: number;
  let pStartBasis: PStartBasis;
  if (input.startRate != null && (input.startSample ?? 0) > 0) {
    pStart = shrink(clamp01(input.startRate), input.startSample ?? 0, base.pStart);
    pStartBasis = "starts";
  } else if (observedPlay != null) {
    pStart = pPlay;
    pStartBasis = "appearances";
    notes.push("Titularisation estimée depuis les apparitions");
  } else {
    pStart = pPlay;
    pStartBasis = "baseline";
  }

  // A starter is by definition also playing, so p(start) can never exceed
  // p(play) — a thin start sample against a long appearance record could
  // otherwise produce one.
  pStart = Math.min(pStart, pPlay);

  // Score when he actually plays. avgL10Played is exactly that; the L5/L15
  // averages include zero-ish games, so they're the weaker fallback.
  //
  // Driven by pPlay, not pStart: a substitute who comes on still scores, so
  // multiplying by the starting probability would systematically under-value
  // rotation players.
  const whenPlaying = input.avgL10Played ?? input.avgL5 ?? input.avgL15 ?? base.start;
  let expected = pPlay * whenPlaying;

  // Sorare publishes its own projection for the coming fixture on some
  // players. It knows things we don't (fixture, opponent, rotation), so blend
  // it in rather than ignoring or blindly trusting it.
  if (input.sorareProjection != null) {
    expected = 0.5 * expected + 0.5 * input.sorareProjection;
    notes.push("Projection Sorare intégrée");
  }

  expected *= 1 + input.cardBonus;

  // Confidence reflects how much we actually know, and drives the UI warning
  // on thin data — not the size of the number itself.
  let confidence = 0.3;
  if (input.app15 != null) confidence += 0.3;
  if (input.avgL10Played != null) confidence += 0.2;
  if (input.sorareProjection != null) confidence += 0.2;
  if (input.recentScores.length < 3) confidence -= 0.2;

  // Knowing whether he starts, rather than merely plays, is real information.
  if (pStartBasis === "starts") confidence += 0.1;

  return {
    pStart: round(clamp01(pStart), 3),
    pPlay: round(clamp01(pPlay), 3),
    pStartBasis,
    expected: round(Math.max(0, expected)),
    floor: round(Math.max(0, (input.avgL15 ?? base.bench) * 0.5 * (1 + input.cardBonus))),
    l5: input.avgL5,
    l15: input.avgL15,
    confidence: round(clamp01(confidence), 2),
    note: notes.join(" · "),
  };
}
