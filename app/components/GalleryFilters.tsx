"use client";

export type SortKey = "score" | "name" | "price" | "form" | "titu";

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
  ["titu", "% Titu"],
  ["price", "Valeur"],
  ["name", "Nom"],
];

export default function GalleryFilters({
  search,
  onSearch,
  position,
  onPosition,
  rarity,
  onRarity,
  sort,
  onSort,
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

        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          aria-label="Trier"
          className="flex-1 bg-ink border border-line rounded-md px-2 py-1.5 text-xs"
        >
          {SORTS.map(([v, label]) => (
            <option key={v} value={v}>
              Tri : {label}
            </option>
          ))}
        </select>

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
