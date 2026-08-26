import type { SquadCard } from "./types";

/**
 * Sealing (Sorare Vault, 2026 redesign — help.sorare.com "Vault Levels and
 * Sealing Points") locks a card to earn a permanent reward boost on
 * In-Season/Classic leaderboards, in exchange for not being able to field it
 * for two weeks per scarcity. The community-recommended strategy (echoed by
 * Sorare itself) is to seal cards that bring nothing to your line-ups anyway
 * — retired players, players whose league Sorare doesn't score, long-term
 * absentees — so the boost is free, not paid for with a card you'd otherwise
 * play. This file only reasons about "is this card worth keeping unsealed",
 * it never talks to the Sorare API: no `sealed`/`sealingPoints` field is
 * exposed on the schema this app already syncs against, so seal status is a
 * manual toggle (Card.sealedAt) set from the Coffre tab instead of synced.
 */

export type SealReasonCode = "no_club" | "league_uncovered" | "inactive";

export interface SealReason {
  code: SealReasonCode;
  label: string;
  detail: string;
}

export interface SealRow {
  card: SquadCard;
  reasons: SealReason[];
}

const INACTIVE_DAYS = 200;

/**
 * Reasons a card is dead weight for line-ups — the exact profile worth
 * sealing. Returns [] for a card that's still worth keeping unsealed, so a
 * suggestion list is just `reasonsForSeal(card).length > 0`.
 */
export function reasonsForSeal(card: SquadCard, coveredLeagues: Set<string>): SealReason[] {
  const reasons: SealReason[] = [];

  if (!card.clubSlug) {
    reasons.push({
      code: "no_club",
      label: "Sans club",
      detail: "Aucun club connu — retraité ou libre, ne peut être aligné nulle part.",
    });
  }

  // Only meaningful once the league list has actually loaded — an empty set
  // (fetch failed, or not loaded yet) must never read as "nothing is
  // covered", which would flag every single card. Same guard as the Mercato
  // "league_uncovered" risk, which this mirrors.
  if (coveredLeagues.size > 0 && card.competitionSlug && !coveredLeagues.has(card.competitionSlug)) {
    reasons.push({
      code: "league_uncovered",
      label: "Championnat non couvert",
      detail: `${card.competitionName ?? card.competitionSlug} — hors du scoring Sorare, ne comptera jamais en Classic/So5.`,
    });
  }

  if (card.clubSlug && !reasons.some((r) => r.code === "no_club")) {
    const last = card.lastPlayedAt ? new Date(card.lastPlayedAt).getTime() : null;
    const daysSince = last ? (Date.now() - last) / (1000 * 60 * 60 * 24) : null;
    if (daysSince != null && daysSince > INACTIVE_DAYS) {
      reasons.push({
        code: "inactive",
        label: "Inactif depuis longtemps",
        detail: `Dernière apparition il y a ${Math.round(daysSince)}j — plus d'utilité tant qu'il ne rejoue pas.`,
      });
    }
  }

  return reasons;
}

/**
 * Splits the squad into: already sealed, suggested to seal (dead weight per
 * reasonsForSeal, not sealed yet), and everything else worth keeping
 * unsealed. Deduped by card, not by player — sealing is a per-card action,
 * so two copies of the same player can land in two different buckets.
 */
export function buildSealAdvice(
  squad: SquadCard[],
  coveredLeagues: Set<string>
): { sealed: SealRow[]; suggested: SealRow[]; keep: SealRow[] } {
  const sealed: SealRow[] = [];
  const suggested: SealRow[] = [];
  const keep: SealRow[] = [];

  for (const card of squad) {
    const reasons = reasonsForSeal(card, coveredLeagues);
    if (card.sealedAt) {
      sealed.push({ card, reasons });
    } else if (reasons.length > 0) {
      suggested.push({ card, reasons });
    } else {
      keep.push({ card, reasons });
    }
  }

  return { sealed, suggested, keep };
}
