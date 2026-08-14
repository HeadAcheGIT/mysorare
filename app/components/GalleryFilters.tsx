"use client";

import SortControl, { type SortDirection } from "./SortControl";

export type SortKey = "score" | "name" | "price" | "form" | "titu" | "u23";
export type { SortDirection };

const POSITIONS = [
  ["", "Tous"],
  ["Goalkeeper", "GK"],
  ["Defender", "DEF"],
  ["Midfielder", "MIL"],
  ["Forward", "ATT"],
] as const;

const SORTS: [SortKey, string][] = [
  ["score", "Score"],
  ["form", "Forme"],
  // Not "% Titu": depending on what has been synced this is either a starting
  // rate or a participation rate (see Projection.pStartBasis), and the card
  // itself says which. A neutral label can't be wrong.
  ["titu", "Probabilité"],
  ["price", "Valeur"],
  ["name", "Nom"],
  ["u23", "U23"],
];

/** Sensible default direction per key, applied when the key itself changes. */
export const DEFAULT_DIRECTION: Record<SortKey, SortDirection> = {
  score: "desc",
  form: "desc",
  titu: "desc",
  price: "desc",
  name: "asc",
  u23: "desc", // most time left as U23 first
};

export default function GalleryFilters({
  search,
  onSearch,
  position,
  onPosition,
  rarity,
  onRarity,
  sort,
  onSort,
  direction,
  onDirection,
  inSeasonOnly,
  onInSeasonOnly,
}: {
  search: string;
  onSearch: (v: string) => void;
  position: string;
  onPosition: (v: string) => void;
  rarity: string;
  onRarity: (v: string) => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
  direction: SortDirection;
  onDirection: (d: SortDirection) => void;
  inSeasonOnly: boolean;
  onInSeasonOnly: (v: boolean) => void;
}) {
  return (
    <div className="space-y-2 mb-4">
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Chercher un joueur ou un club"
        aria-label="Chercher un joueur ou un club"
        className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
      />

      <div className="flex gap-1.5" role="group" aria-label="Filtrer par poste">
        {POSITIONS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => onPosition(value)}
            aria-pressed={position === value}
            className={`flex-1 py-1.5 rounded-md text-xs font-display uppercase tracking-wide border ${
              position === value ? "bg-flood text-ink border-flood font-bold" : "border-line text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <select
          value={rarity}
          onChange={(e) => onRarity(e.target.value)}
          aria-label="Filtrer par rareté"
          className="flex-1 bg-ink border border-line rounded-md px-2 py-1.5 text-xs"
        >
          <option value="">Toutes raretés</option>
          <option value="common">Common</option>
          <option value="limited">Limited</option>
          <option value="rare">Rare</option>
          <option value="super_rare">Super Rare</option>
          <option value="unique">Unique</option>
        </select>

        <div className="flex-1">
          <SortControl
            sortKey={sort}
            onSortKey={(k) => {
              onSort(k);
              onDirection(DEFAULT_DIRECTION[k]);
            }}
            options={SORTS}
            direction={direction}
            onDirection={onDirection}
          />
        </div>

        <button
          onClick={() => onInSeasonOnly(!inSeasonOnly)}
          aria-pressed={inSeasonOnly}
          className={`px-3 py-1.5 rounded-md text-xs font-mono border ${
            inSeasonOnly ? "bg-ok/15 text-ok border-ok" : "border-line text-muted"
          }`}
        >
          IS
        </button>
      </div>
    </div>
  );
}
