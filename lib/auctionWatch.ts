/**
 * Turning a live auction into a decision.
 *
 * Sorare's auction feed is global and unfiltered, and an auction in progress
 * is not a market price — it's a price *so far*. What makes it actionable is
 * the pair of questions a manager actually asks: is the current bid below what
 * these cards trade at, and how long is left to act.
 *
 * Pure and free of server imports so both the API layer and the client can use
 * it, and so the thresholds are testable rather than buried in a component.
 */

export type AuctionVerdict =
  | "bonne_affaire" // meaningfully under the market
  | "au_prix" // roughly at the market
  | "trop_cher" // above the market
  | "inconnu"; // no valuation to compare against

/** Under the market by at least this much to count as a bargain. */
export const BARGAIN_DISCOUNT_PCT = 15;
/** Over the market by at least this much to be called expensive. */
export const EXPENSIVE_PREMIUM_PCT = 10;
/** Below this many minutes left, the auction needs watching now. */
export const ENDING_SOON_MINUTES = 30;

export interface AuctionInput {
  /** Current bid, in EUR. Null when it couldn't be converted. */
  currentEur: number | null;
  /** What the card trades at — see lib/valuation.ts. Null when unknown. */
  valuationEur: number | null;
  endDate: string;
}

export interface AuctionOpportunity {
  /** How far under the market the current bid sits. Negative means over. */
  discountPct: number | null;
  minutesLeft: number | null;
  endingSoon: boolean;
  ended: boolean;
  verdict: AuctionVerdict;
}

const round = (v: number) => Math.round(v * 10) / 10;

export function assessAuction(input: AuctionInput, now: Date = new Date()): AuctionOpportunity {
  const end = Date.parse(input.endDate);
  const minutesLeft = Number.isFinite(end) ? Math.floor((end - now.getTime()) / 60_000) : null;
  const ended = minutesLeft != null && minutesLeft <= 0;

  let discountPct: number | null = null;
  let verdict: AuctionVerdict = "inconnu";

  if (input.currentEur != null && input.valuationEur != null && input.valuationEur > 0) {
    // Positive = the bid is under the market, i.e. room to buy well.
    discountPct = round(((input.valuationEur - input.currentEur) / input.valuationEur) * 100);
    if (discountPct >= BARGAIN_DISCOUNT_PCT) verdict = "bonne_affaire";
    else if (discountPct <= -EXPENSIVE_PREMIUM_PCT) verdict = "trop_cher";
    else verdict = "au_prix";
  }

  return {
    discountPct,
    minutesLeft,
    endingSoon: minutesLeft != null && minutesLeft > 0 && minutesLeft <= ENDING_SOON_MINUTES,
    ended,
    verdict,
  };
}

/**
 * Orders auctions the way a manager would work through them: the bargains
 * about to close first, because those are the only ones where hesitating
 * costs the opportunity. Everything already finished sinks to the bottom
 * whatever its price.
 */
export function rankAuctions<T extends { opportunity: AuctionOpportunity }>(rows: T[]): T[] {
  const score = (r: T) => {
    const o = r.opportunity;
    if (o.ended) return -Infinity;

    // A discount is only worth chasing if there's still time; an auction with
    // hours left can be revisited, one with minutes cannot.
    const urgency = o.minutesLeft == null ? 0 : Math.max(0, 1 - o.minutesLeft / (24 * 60));
    const value = o.discountPct ?? 0;
    return value + urgency * 40;
  };
  return [...rows].sort((a, b) => score(b) - score(a));
}
