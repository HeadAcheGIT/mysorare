import type { SquadCard } from "./types";

/**
 * "Non-titulaire probable" pre-gameweek check: cards saved into a lineup for
 * the fixture still open for line-ups, whose current start probability has
 * since dropped low — a rumour, a late fitness doubt, or (closest to kickoff)
 * a confirmed line-up the player didn't make (see checkConfirmedLineups in
 * lib/services/sync.ts, which recomputes pStart from official XIs once
 * they're out). Only meaningful for the still-adjustable fixture: a saved
 * lineup for a closed fixture is history, graded instead by Debrief.
 */

const BENCH_RISK_THRESHOLD = 0.4;

export interface BenchRiskCard {
  cardSlug: string;
  playerSlug: string;
  name: string;
  club: string | null;
  pStart: number;
  pStartBasis: SquadCard["pStartBasis"];
}

/**
 * Cards from `cardSlugs` that are in the current squad with a start
 * probability at or below the risk threshold, sorted worst-first. Cards not
 * found in `squad` (sold, or the squad hasn't loaded) are silently skipped —
 * "unknown" must not read as "safe" or "risky".
 */
export function benchRisks(cardSlugs: string[], squad: SquadCard[]): BenchRiskCard[] {
  const bySlug = new Map(squad.map((c) => [c.cardSlug, c]));
  const risks: BenchRiskCard[] = [];

  for (const cardSlug of cardSlugs) {
    const card = bySlug.get(cardSlug);
    if (!card || card.pStart == null || card.pStart > BENCH_RISK_THRESHOLD) continue;
    risks.push({
      cardSlug,
      playerSlug: card.playerSlug,
      name: card.name,
      club: card.club,
      pStart: card.pStart,
      pStartBasis: card.pStartBasis,
    });
  }

  return risks.sort((a, b) => a.pStart - b.pStart);
}
