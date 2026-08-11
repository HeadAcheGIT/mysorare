/**
 * Pure form-curve math, split out of Sparkline.tsx so it's testable without a
 * JSX/DOM environment — see the Sparkline unit tests.
 */

/** Above this many days without a recorded appearance, the curve is stale rather than "form". */
export const STALE_DAYS = 21;

export function daysSince(isoDate: string, now: number = Date.now()): number {
  return (now - new Date(isoDate).getTime()) / 86_400_000;
}

export function isStale(lastPlayedAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!lastPlayedAt) return false;
  const d = daysSince(lastPlayedAt, now);
  return Number.isFinite(d) && d > STALE_DAYS;
}

/** Whether the most recent point reads as "good" (>= the series average) — drives line colour. */
export function isTrendingGood(scores: number[]): boolean {
  if (!scores.length) return false;
  const last = scores[scores.length - 1];
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return last >= avg;
}
