"use client";

export type SortDirection = "asc" | "desc";

/**
 * One consistent sort control for every list in the app: a key picker plus
 * an explicit direction toggle. Before this, direction was hard-coded per
 * key (e.g. "Valeur" always meant highest-first) with no way to flip it —
 * fine until someone wants cheapest-first instead.
 *
 * `sensibleDirection` lets a caller pick a good default *when the key
 * changes* (e.g. "Nom" defaults A→Z, "Score" defaults highest-first)
 * without fighting a direction the user explicitly chose for the previous key.
 */
export default function SortControl<K extends string>({
  sortKey,
  onSortKey,
  options,
  direction,
  onDirection,
  label = "Trier",
}: {
  sortKey: K;
  onSortKey: (key: K) => void;
  options: readonly (readonly [K, string])[];
  direction: SortDirection;
  onDirection: (d: SortDirection) => void;
  label?: string;
}) {
  return (
    <div className="flex gap-1.5">
      <select
        value={sortKey}
        onChange={(e) => onSortKey(e.target.value as K)}
        aria-label={label}
        className="flex-1 min-w-0 bg-ink border border-line rounded-md px-2 py-1.5 text-xs"
      >
        {options.map(([v, optLabel]) => (
          <option key={v} value={v}>
            {label} : {optLabel}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onDirection(direction === "desc" ? "asc" : "desc")}
        aria-label={direction === "desc" ? "Ordre décroissant — passer en croissant" : "Ordre croissant — passer en décroissant"}
        title={direction === "desc" ? "Décroissant" : "Croissant"}
        className="shrink-0 w-9 grid place-items-center rounded-md border border-line text-muted font-mono text-sm hover:text-white hover:border-flood/60"
      >
        {direction === "desc" ? "↓" : "↑"}
      </button>
    </div>
  );
}
