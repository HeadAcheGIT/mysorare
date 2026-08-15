/**
 * Ranking maths for the market scouting list. Pure and free of server imports
 * so the client component can use it directly and it stays testable.
 *
 * Why this exists: scouting used to rank on `avgL5` alone. Run against real
 * Ligue 1 data that put a reserve goalkeeper who had played one game in
 * fifteen at the very top of "best form" — one clean sheet, a huge score, and
 * nothing to say he never plays. Acting on that ranking loses money, which is
 * the opposite of what the screen is for.
 */

export interface RankablePlayer {
  avgL5: number | null;
  /** Appearances in the club's last 15 games — the sample behind avgL5. */
  app15: number | null;
  /**
   * What the card actually trades at (see lib/valuation.ts). Preferred over
   * the last sale, which is one transaction: consecutive Maxime Lopez sales
   * ran 6,38 €, 20,14 € then 8,33 €, so ranking on it would reshuffle the
   * whole list on a single trade.
   */
  valuation?: { value: number | null } | null;
  inSeasonTrend?: { lastSale: { amount: number; currency: string } | null } | null;
}

/**
 * Games below which a form average says more about luck than about the player.
 * Used as the shrinkage constant: at `app15 == THIN_SAMPLE` the form counts
 * for roughly half its face value.
 */
export const THIN_SAMPLE = 4;

/** True when there is too little playing time behind the average to trust it. */
export function isThinSample(app15: number | null): boolean {
  return app15 == null || app15 < THIN_SAMPLE;
}

/**
 * Form discounted by how much football is actually behind it.
 *
 * Deliberately not shown as a score — the list keeps displaying the real L5 so
 * nothing is hidden. This only decides the order, so that "best form" means
 * "best form you can count on" rather than "luckiest single appearance".
 */
export function reliableForm(p: RankablePlayer): number | null {
  if (p.avgL5 == null) return null;
  const games = p.app15 ?? 0;
  return p.avgL5 * (games / (games + THIN_SAMPLE));
}

/**
 * Points of reliable form per euro — the ROI question the screen exists to
 * answer, and the one thing a price column next to a form column can't answer
 * on its own.
 *
 * Null without a completed sale to price against: an unpriced player must not
 * rank as infinitely good value.
 */
export function priceOf(p: RankablePlayer): number | null {
  // The valuation first; the last sale only as a fallback when there aren't
  // enough trades to build one.
  return p.valuation?.value ?? p.inSeasonTrend?.lastSale?.amount ?? null;
}

export function valuePerEuro(p: RankablePlayer): number | null {
  const form = reliableForm(p);
  const price = priceOf(p);
  if (form == null || price == null || price <= 0) return null;
  return form / price;
}
