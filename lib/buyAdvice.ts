/**
 * What to buy next, ranked by what it would actually add to a line-up.
 *
 * A cheap card with a good score is not automatically a good buy: if you
 * already field someone better in that position, it adds nothing. The only
 * figure that decides a purchase is the **marginal** one — how many points it
 * puts on your best line-up, per euro it costs.
 *
 * The comparison is against your best card in the same position, which is the
 * honest simplification: a So5 line-up takes one goalkeeper and four outfield
 * players, so a new card competes first with the one it would replace. It is
 * not a full re-solve of the line-up, and the UI says so.
 *
 * Pure and free of server imports.
 */

export interface OwnedCard {
  position: string;
  /** Projected score for the coming game week. */
  expected: number | null;
}

export interface Candidate {
  playerSlug: string;
  playerName: string;
  position: string;
  /** Projected score for the coming game week. */
  expected: number | null;
  /** What a card of this player costs, from completed sales. */
  price: number | null;
  /** True when the projection rests on too little history to lean on. */
  thin?: boolean;
  /** True when the market is still in its launch phase and the price isn't settled. */
  launchPremium?: boolean;
}

export interface Upgrade extends Candidate {
  /** Best projected score currently owned in that position — null when none. */
  currentBest: number | null;
  /** Points this card would add to the line-up. */
  gain: number;
  /** Points added per euro spent — the number that ranks a purchase. */
  gainPerEuro: number | null;
  affordable: boolean | null;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Best projected score owned, per position. */
export function bestByPosition(owned: OwnedCard[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const c of owned) {
    if (c.expected == null) continue;
    const cur = best.get(c.position);
    if (cur == null || c.expected > cur) best.set(c.position, c.expected);
  }
  return best;
}

/**
 * Ranks candidates by points added per euro.
 *
 * Candidates that would not improve the line-up are dropped entirely rather
 * than shown with a negative gain: a buy list is a list of things worth buying.
 *
 * `budget` null means "unknown" — affordability is reported as null instead of
 * guessed, so a missing balance never silently hides an option.
 */
export function rankUpgrades(
  owned: OwnedCard[],
  candidates: Candidate[],
  budget: number | null
): Upgrade[] {
  const best = bestByPosition(owned);

  return candidates
    .map((c): Upgrade | null => {
      if (c.expected == null) return null;
      const currentBest = best.get(c.position) ?? null;
      const gain = currentBest == null ? c.expected : c.expected - currentBest;
      if (gain <= 0) return null;

      return {
        ...c,
        currentBest,
        gain: round(gain),
        // A price of zero would make this infinite; unknown stays unknown.
        gainPerEuro: c.price != null && c.price > 0 ? round(gain / c.price) : null,
        affordable: budget == null ? null : c.price != null && c.price <= budget,
      };
    })
    .filter((u): u is Upgrade => u != null)
    .sort((a, b) => {
      // Affordable first — an upgrade you cannot pay for is not a decision.
      if (a.affordable !== b.affordable) {
        if (a.affordable === true) return -1;
        if (b.affordable === true) return 1;
      }
      // Then by points per euro, with unpriced candidates last: without a
      // price there is no way to say whether it is worth it.
      return (b.gainPerEuro ?? -Infinity) - (a.gainPerEuro ?? -Infinity);
    });
}

/** The position where the squad is weakest, i.e. where a buy helps most. */
export function weakestPosition(owned: OwnedCard[], positions: string[]): string | null {
  const best = bestByPosition(owned);
  let worst: { position: string; score: number } | null = null;
  for (const p of positions) {
    // A position with no card at all is the weakest there is.
    const score = best.get(p) ?? -Infinity;
    if (!worst || score < worst.score) worst = { position: p, score };
  }
  return worst?.position ?? null;
}
