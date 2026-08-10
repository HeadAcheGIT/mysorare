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

export interface PublicForm {
  pStart: number;
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
}

const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function projectFromPublic(input: PublicInput): PublicForm {
  const base = POSITION_BASELINE[input.position] ?? POSITION_BASELINE.Midfielder;
  const notes: string[] = [];

  if (!input.hasClub) {
    return {
      pStart: 0,
      expected: 0,
      floor: 0,
      l5: input.avgL5,
      l15: input.avgL15,
      confidence: 0.9,
      note: "Sans club — ne peut pas marquer",
    };
  }
  if (input.injured || input.suspended) {
    return {
      pStart: 0,
      expected: 0,
      floor: 0,
      l5: input.avgL5,
      l15: input.avgL15,
      confidence: 0.95,
      note: input.suspended ? "Suspendu" : "Blessé",
    };
  }

  // Recent form is the better predictor, but 5 games is noisy — weight it
  // ahead of the 15-game window without letting it dominate.
  const rate5 = input.app5 != null ? clamp01(input.app5 / 5) : null;
  const rate15 = input.app15 != null ? clamp01(input.app15 / 15) : null;

  let observed: number | null = null;
  let sampleGames = 0;
  if (rate5 != null && rate15 != null) {
    observed = 0.65 * rate5 + 0.35 * rate15;
    sampleGames = 15;
  } else if (rate5 != null) {
    observed = rate5;
    sampleGames = 5;
  } else if (rate15 != null) {
    observed = rate15;
    sampleGames = 15;
  }

  let pStart: number;
  if (observed == null) {
    pStart = base.pStart * 0.6;
    notes.push("Aucune donnée de temps de jeu");
  } else {
    // Shrink toward the position baseline in proportion to how little we saw.
    pStart = (observed * sampleGames + base.pStart * PRIOR_WEIGHT) / (sampleGames + PRIOR_WEIGHT);
    if (sampleGames <= 5) notes.push("Échantillon réduit");
  }

  // Score when he actually plays. avgL10Played is exactly that; the L5/L15
  // averages include zero-ish games, so they're the weaker fallback.
  const whenPlaying = input.avgL10Played ?? input.avgL5 ?? input.avgL15 ?? base.start;
  let expected = pStart * whenPlaying;

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

  return {
    pStart: round(clamp01(pStart), 3),
    expected: round(Math.max(0, expected)),
    floor: round(Math.max(0, (input.avgL15 ?? base.bench) * 0.5 * (1 + input.cardBonus))),
    l5: input.avgL5,
    l15: input.avgL15,
    confidence: round(clamp01(confidence), 2),
    note: notes.join(" · "),
  };
}
