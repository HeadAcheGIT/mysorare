/**
 * Which valuations to refresh next.
 *
 * A valuation costs one Sorare request that can't be batched, and the public
 * API allows one call every ~3.2 s. A gallery holding 200 cards therefore
 * can't be revalued on demand — it has to be refreshed a slice at a time, and
 * the slice has to be chosen well: whatever is refreshed first is what the
 * manager sees a real number for soonest.
 *
 * The order is:
 *   1. never computed — those render as "—", the worst state to leave a card in;
 *   2. then the stalest, oldest first.
 *
 * Fresh entries are skipped entirely, so a second refresh right after a first
 * one costs nothing rather than burning the whole budget re-fetching prices
 * that haven't moved.
 *
 * Pure and free of server imports, so the choice can be tested without a
 * database or the network.
 */

export interface Holding {
  playerSlug: string;
  rarity: string;
  /** In-season and classic are separate markets — see PlayerValuation in the schema. */
  inSeason: boolean;
}

export interface CachedValuation extends Holding {
  computedAt: Date;
}

/**
 * How long a valuation stays usable.
 *
 * Six hours rather than a day: a launching season moves within a session —
 * Maxime Lopez went from 30 € to 5 € in five days — and rather than a week,
 * because outside a launch the median barely moves and refetching is pure
 * budget spent on an unchanged number.
 */
export const VALUATION_TTL_HOURS = 6;

const HOUR_MS = 3_600_000;

export function valuationKey(h: Holding): string {
  return `${h.playerSlug}:${h.rarity}:${h.inSeason ? "IS" : "C"}`;
}

/**
 * Distinct markets across a set of cards.
 *
 * Several cards of the same player, rarity and eligibility share one market,
 * so five Lopez limiteds are one request, not five.
 */
export function distinctMarkets(holdings: Holding[]): Holding[] {
  const seen = new Map<string, Holding>();
  for (const h of holdings) {
    if (!h.playerSlug || !h.rarity) continue;
    const k = valuationKey(h);
    if (!seen.has(k)) seen.set(k, { playerSlug: h.playerSlug, rarity: h.rarity, inSeason: h.inSeason });
  }
  return [...seen.values()];
}

/**
 * The markets worth refetching, most urgent first.
 *
 * `limit` bounds a single batch to what fits one serverless invocation; the
 * caller loops until `staleTargets` comes back empty.
 */
export function staleTargets(
  holdings: Holding[],
  cached: CachedValuation[],
  now: Date = new Date(),
  ttlHours: number = VALUATION_TTL_HOURS
): Holding[] {
  const at = new Map<string, number>();
  for (const c of cached) {
    const t = c.computedAt instanceof Date ? c.computedAt.getTime() : Date.parse(String(c.computedAt));
    if (Number.isFinite(t)) at.set(valuationKey(c), t);
  }

  const cutoff = now.getTime() - ttlHours * HOUR_MS;

  return distinctMarkets(holdings)
    .map((h) => ({ h, computedAt: at.get(valuationKey(h)) }))
    // `undefined` means never computed and must sort ahead of everything, so
    // it can't just fall through a numeric comparison.
    .filter(({ computedAt }) => computedAt === undefined || computedAt < cutoff)
    .sort((a, b) => (a.computedAt ?? -Infinity) - (b.computedAt ?? -Infinity))
    .map(({ h }) => h);
}
