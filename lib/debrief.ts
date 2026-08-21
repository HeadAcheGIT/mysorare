/**
 * What a game week's line-up actually returned, against the best that was
 * available from the same cards.
 *
 * The gap is the only number that prices a decision. A line-up that scored 210
 * is neither good nor bad on its own; a line-up that scored 210 when 260 was
 * sitting on the bench is a 50-point mistake, and that is what improves a
 * manager week over week.
 *
 * Both sides must be measured with the same ruler. Sorare's own per-card score
 * and a score derived from our `Appearance` rows are not guaranteed to be the
 * same scale, so a regret computed across the two would be an artefact of the
 * mismatch rather than a real loss. Everything compared here comes from one
 * source; Sorare's official total is carried alongside as a reference only.
 *
 * Pure and free of server imports.
 */

export interface ScoredCard {
  cardSlug: string;
  playerSlug: string;
  playerName: string;
  position: string;
  /** So5 score actually achieved that game week — null when the player didn't play. */
  score: number | null;
  captain?: boolean;
}

/** Sorare's So5 captain bonus. */
export const CAPTAIN_MULTIPLIER = 1.2;

/**
 * Total for a line-up, captain bonus included.
 *
 * A card with no score counts as zero rather than being skipped: a player who
 * didn't play *did* cost you a slot, and dropping him would flatter the total.
 */
export function scoreLineup(cards: ScoredCard[], captainMultiplier = CAPTAIN_MULTIPLIER): number {
  let total = 0;
  for (const c of cards) {
    const s = c.score ?? 0;
    total += c.captain ? s * captainMultiplier : s;
  }
  return round(total);
}

export interface Regret {
  /** What the fielded line-up scored, on our ruler. */
  actual: number;
  /** What the best available line-up would have scored, on the same ruler. */
  best: number;
  /** best - actual, never negative. */
  points: number;
  /** Cards that were available and would have improved the total. */
  missed: ScoredCard[];
  /** Cards fielded that the better line-up drops. */
  dropped: ScoredCard[];
}

/**
 * Difference between what was fielded and the best that was available.
 *
 * Clamped at zero: if the fielded line-up beats the "best" one, the pool used
 * to build the best is incomplete (a card sold since, for instance), and a
 * negative regret would read as "you did better than possible" rather than as
 * the missing information it really is.
 */
export function computeRegret(actual: ScoredCard[], best: ScoredCard[]): Regret {
  const actualTotal = scoreLineup(actual);
  const bestTotal = scoreLineup(best);

  const actualSlugs = new Set(actual.map((c) => c.cardSlug));
  const bestSlugs = new Set(best.map((c) => c.cardSlug));

  return {
    actual: actualTotal,
    best: bestTotal,
    points: round(Math.max(bestTotal - actualTotal, 0)),
    missed: best.filter((c) => !actualSlugs.has(c.cardSlug)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    dropped: actual.filter((c) => !bestSlugs.has(c.cardSlug)).sort((a, b) => (a.score ?? 0) - (b.score ?? 0)),
  };
}

/**
 * Plain-French reading of a regret, so the number carries a judgement.
 *
 * The thresholds are deliberately coarse: this is meant to separate "you
 * picked well" from "you left a lot behind", not to grade to the point.
 */
export function regretVerdict(r: Regret): { label: string; tone: "ok" | "neutral" | "warn" } {
  if (r.best <= 0) return { label: "Aucun score à comparer", tone: "neutral" };
  const share = r.points / r.best;
  if (share < 0.05) return { label: "Compo quasi optimale", tone: "ok" };
  if (share < 0.15) return { label: "Bon choix, marge limitée", tone: "ok" };
  if (share < 0.3) return { label: "Marge de progression réelle", tone: "neutral" };
  return { label: "Beaucoup de points laissés sur le banc", tone: "warn" };
}

const round = (v: number) => Math.round(v * 100) / 100;
