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
  shirtNumber: number | null;
  sorareProjection: number | null;
  recentScores: number[];
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

/** Tailwind needs literal class names — `text-${rarity}` would be purged. */
export const RARITY_CLASS: Record<string, { text: string; border: string; bg: string; label: string }> = {
  common: { text: "text-common", border: "border-common", bg: "bg-common", label: "Common" },
  limited: { text: "text-limited", border: "border-limited", bg: "bg-limited", label: "Limited" },
  rare: { text: "text-rare", border: "border-rare", bg: "bg-rare", label: "Rare" },
  super_rare: { text: "text-superrare", border: "border-superrare", bg: "bg-superrare", label: "Super Rare" },
  unique: { text: "text-white", border: "border-white", bg: "bg-white", label: "Unique" },
};

export const rarityOf = (r: string) => RARITY_CLASS[r] ?? RARITY_CLASS.common;
