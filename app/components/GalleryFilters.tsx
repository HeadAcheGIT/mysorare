"use client";

import { useState } from "react";
import SortControl, { type SortDirection } from "./SortControl";

export type SortKey = "score" | "name" | "price" | "form" | "titu" | "u23" | "recent";
export type { SortDirection };

/** One of the manager's real divisions, for the eligibility filter. */
export type DivisionOption = { slug: string; label: string };

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
  ["recent", "Récent"],
];

/** Sensible default direction per key, applied when the key itself changes. */
export const DEFAULT_DIRECTION: Record<SortKey, SortDirection> = {
  score: "desc",
  form: "desc",
  titu: "desc",
  price: "desc",
  name: "asc",
  u23: "desc", // most time left as U23 first
  recent: "desc", // newest acquisition first
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
  probableStarterOnly,
  onProbableStarterOnly,
  roiFilter,
  onRoiFilter,
  divisions,
  division,
  onDivision,
  divisionLoading,
  divisionNote,
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
  probableStarterOnly: boolean;
  onProbableStarterOnly: (v: boolean) => void;
  roiFilter: "" | "gain" | "loss";
  onRoiFilter: (v: "" | "gain" | "loss") => void;
  divisions: DivisionOption[];
  division: string;
  onDivision: (v: string) => void;
  divisionLoading: boolean;
  divisionNote: string | null;
}) {
  // Closed by default: the badge on the toggle already says how many are
  // active, so a manager who set filters last visit isn't left wondering
  // whether they're still applied just because the panel starts collapsed.
  const [open, setOpen] = useState(false);
  const activeCount = [
    position !== "",
    rarity !== "",
    division !== "",
    inSeasonOnly,
    probableStarterOnly,
    roiFilter !== "",
  ].filter(Boolean).length;

  return (
    <div className="space-y-2 mb-4">
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Nom, club, championnat, poste, saison…"
        aria-label="Chercher dans la galerie"
        className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono border ${
            activeCount > 0 ? "border-flood text-flood" : "border-line text-muted"
          }`}
        >
          Filtres
          {activeCount > 0 && (
            <span className="min-w-[16px] h-4 px-1 rounded-full bg-flood text-ink text-[10px] font-bold flex items-center justify-center leading-none">
              {activeCount}
            </span>
          )}
          <span aria-hidden className="text-[10px]">{open ? "▴" : "▾"}</span>
        </button>

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
      </div>

      {open && (
        <div className="space-y-2 pt-1 border-t border-line/60">
          {/* Eligibility is Sorare's own answer, not a rule we re-derive: a
              division's bench already accounts for rarity, season and cards
              committed elsewhere, which no local filter could reproduce. */}
          {divisions.length > 0 && (
            <div>
              <select
                value={division}
                onChange={(e) => onDivision(e.target.value)}
                aria-label="Filtrer par division d'éligibilité"
                className="w-full bg-ink border border-line rounded-md px-2 py-1.5 text-xs"
              >
                <option value="">Toutes mes cartes</option>
                {divisions.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    Éligibles — {d.label}
                  </option>
                ))}
              </select>
              {(divisionLoading || divisionNote) && (
                <p className="mt-1 font-mono text-[10px] text-muted">
                  {divisionLoading ? "Lecture du vivier Sorare…" : divisionNote}
                </p>
              )}
            </div>
          )}

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
              <option value="limited">Limited</option>
              <option value="rare">Rare</option>
            </select>

            <button
              onClick={() => onInSeasonOnly(!inSeasonOnly)}
              aria-pressed={inSeasonOnly}
              title="N'afficher que les cartes éligibles à la saison Sorare en cours"
              className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-mono border whitespace-nowrap ${
                inSeasonOnly ? "bg-ok/15 text-ok border-ok" : "border-line text-muted"
              }`}
            >
              Saison en cours
            </button>
          </div>

          <div className="flex gap-2">
            <select
              value={roiFilter}
              onChange={(e) => onRoiFilter(e.target.value as "" | "gain" | "loss")}
              aria-label="Filtrer par plus/moins-value"
              className="flex-1 bg-ink border border-line rounded-md px-2 py-1.5 text-xs"
            >
              <option value="">Plus/moins-value : toutes</option>
              <option value="gain">En plus-value</option>
              <option value="loss">En moins-value</option>
            </select>

            <button
              onClick={() => onProbableStarterOnly(!probableStarterOnly)}
              aria-pressed={probableStarterOnly}
              className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-mono border whitespace-nowrap ${
                probableStarterOnly ? "bg-ok/15 text-ok border-ok" : "border-line text-muted"
              }`}
            >
              Titu probable
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
