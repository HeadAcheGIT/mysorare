/**
 * Shapes shared between the API routes and the client components. Kept free of
 * any server import (Prisma, services) so client components can use them
 * without dragging server code into the browser bundle.
 */

export interface SquadCard {
  cardSlug: string;
  playerSlug: string;
  name: string;
  position: string;
  rarity: string;
  season: number | null;
  inSeason: boolean;
  serial: number | null;
  bonus: number;
  club: string | null;
  clubSlug: string | null;
  clubPicture: string | null;
  injury: string | null;
  suspended: boolean;
  pStart: number | null;
  confidence: number | null;
  expected: number | null;
  floor: number | null;
  l5: number | null;
  l15: number | null;
  note: string | null;
  excluded: boolean;

  picture: string | null;
  country: string | null;
  age: number | null;
  /** ISO date of birth, when the public API has it — powers the U23 badge. */
  birthDate: string | null;
  shirtNumber: number | null;
  sorareProjection: number | null;
  recentScores: number[];
  /** ISO date of the player's most recent recorded appearance, if known. */
  lastPlayedAt: string | null;
  /** The club's domestic league/division, from the public API. */
  competitionSlug: string | null;
  competitionName: string | null;
  l10: number | null;
  price: number | null;
  floorPrice: number | null;
  estimatedPrice: number | null;
  boughtPrice: number | null;
}

export type SquadResponse = { fixture: string | null; cards: SquadCard[] };

export const POSITION_SHORT: Record<string, string> = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MIL",
  Forward: "ATT",
};

export const POSITION_LABEL: Record<string, string> = {
  Goalkeeper: "Gardien",
  Defender: "Défenseur",
  Midfielder: "Milieu",
  Forward: "Attaquant",
};

/**
 * Tailwind needs literal class names — `text-${rarity}` would be purged (see
 * tailwind.config.ts's `content` glob, which has to cover this file for these
 * to generate at all).
 *
 * `border` is deliberately `border-l-*` (left-edge only), not `border-*` —
 * the latter is shorthand for all four sides, and consumers pair it with a
 * separate `border-line` on the other three sides. Two same-specificity rules
 * fighting over the same longhand (`border-left-color`) resolve by whichever
 * is later in Tailwind's generated stylesheet, which is alphabetical and not
 * something to depend on — `border-l-*` touches a property `border-line`
 * never sets, so there's nothing to race.
 */
export const RARITY_CLASS: Record<string, { text: string; border: string; bg: string; label: string }> = {
  common: { text: "text-common", border: "border-l-common", bg: "bg-common", label: "Common" },
  limited: { text: "text-limited", border: "border-l-limited", bg: "bg-limited", label: "Limited" },
  rare: { text: "text-rare", border: "border-l-rare", bg: "bg-rare", label: "Rare" },
  super_rare: { text: "text-superrare", border: "border-l-superrare", bg: "bg-superrare", label: "Super Rare" },
  unique: { text: "text-white", border: "border-l-white", bg: "bg-white", label: "Unique" },
};

export const rarityOf = (r: string) => RARITY_CLASS[r] ?? RARITY_CLASS.common;

/**
 * So5 score bands, aligned with Sorare's own colour coding (roughly: red
 * below 40, neutral 40-59, green 60+) so a number reads the same colour here
 * as it does on Sorare — rather than a colour relative to the player's own
 * average, which made a flat run of bad scores look "fine".
 */
export function scoreColor(score: number | null | undefined): "warn" | "neutral" | "ok" {
  if (score == null) return "neutral";
  if (score < 40) return "warn";
  if (score < 60) return "neutral";
  return "ok";
}

export const SCORE_COLOR_CLASS: Record<ReturnType<typeof scoreColor>, string> = {
  warn: "text-warn",
  neutral: "text-flood",
  ok: "text-ok",
};

/**
 * U23 status from birth date: eligible while under 23, with the "valid
 * until" date being exactly the 23rd birthday. This mirrors the age cut used
 * for U23-restricted competitions, but note Sorare's own per-season cutoff
 * (e.g. tied to a calendar year rather than a rolling birthday) isn't exposed
 * by the public API, so treat this as an approximation, not the official date.
 */
export function u23Status(birthDate: string | null): { eligible: boolean; validUntil: Date } | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;
  const validUntil = new Date(dob);
  validUntil.setFullYear(validUntil.getFullYear() + 23);
  return { eligible: validUntil.getTime() > Date.now(), validUntil };
}
