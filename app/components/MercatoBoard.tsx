"use client";

import { useMemo, useState } from "react";
import { POSITION_SHORT, type SquadCard } from "@/lib/types";
import {
  buildMercatoLists,
  filterByReason,
  countByReason,
  REASON_META,
  type MercatoItem,
  type MercatoReasonCode,
} from "@/lib/mercatoBoard";
import type { MercatoSignalRow } from "@/lib/services/mercato";
import { relativeDate } from "@/lib/format";
import type { PlayerAlert } from "./AlertBadges";

/** Fixed display order for the filter chips — risk reasons first, then opportunity ones. */
const REASON_ORDER: MercatoReasonCode[] = ["transfer", "start_down", "league_uncovered", "start_up", "form_up"];

/**
 * The Mercato tab: every gallery player worth watching right now, split into
 * what could go wrong and what could go right — a live transfer story (see
 * lib/services/alerts.ts), a starting-time trend, a form trend, or a
 * championship the market scouting tab can't search (see lib/mercatoBoard.ts
 * for exactly how each is decided and why nothing here guesses at a rumoured
 * transfer's destination).
 *
 * Filter chips narrow either list to one reason at a time (or several, OR'd
 * together — see filterByReason); sections collapse independently so a long
 * list can be tucked away without losing the count. Both exist for the same
 * reason: a gallery with plenty of flagged players turns this tab into a lot
 * of scrolling otherwise.
 */
export default function MercatoBoard({
  squad,
  alertsBySlug,
  coveredLeagues,
  signals,
  onSelectPlayer,
}: {
  squad: SquadCard[];
  alertsBySlug: Record<string, PlayerAlert[]>;
  coveredLeagues: Set<string>;
  signals: Record<string, MercatoSignalRow>;
  onSelectPlayer: (playerSlug: string) => void;
}) {
  const { risks, opportunities } = useMemo(
    () => buildMercatoLists(squad, alertsBySlug, coveredLeagues, signals),
    [squad, alertsBySlug, coveredLeagues, signals]
  );

  const counts = useMemo(() => countByReason([...risks, ...opportunities]), [risks, opportunities]);
  const [activeFilters, setActiveFilters] = useState<Set<MercatoReasonCode>>(new Set());
  const toggleFilter = (code: MercatoReasonCode) =>
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const filteredRisks = useMemo(() => filterByReason(risks, activeFilters), [risks, activeFilters]);
  const filteredOpportunities = useMemo(
    () => filterByReason(opportunities, activeFilters),
    [opportunities, activeFilters]
  );

  const availableCodes = REASON_ORDER.filter((code) => (counts[code] ?? 0) > 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Ce qui bouge sur tes joueurs pendant le mercato, et ce que ça change pour tes compos — rumeurs
        croisées sur plusieurs sources, tendance de titularisation et de forme calculées depuis tes
        données, championnats hors du scouting marché.
      </p>

      {availableCodes.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filtrer par motif">
          {availableCodes.map((code) => {
            const meta = REASON_META[code];
            const active = activeFilters.has(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={active}
                onClick={() => toggleFilter(code)}
                className={`shrink-0 px-2.5 py-1.5 rounded-md text-xs font-mono border whitespace-nowrap ${
                  active ? "bg-flood text-ink border-flood font-bold" : "border-line text-muted"
                }`}
              >
                {meta.icon} {meta.label} ({counts[code]})
              </button>
            );
          })}
          {activeFilters.size > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilters(new Set())}
              className="shrink-0 px-2.5 py-1.5 rounded-md text-xs font-mono text-warn border border-warn whitespace-nowrap"
            >
              ✕ Réinitialiser
            </button>
          )}
        </div>
      )}

      <MercatoSection
        title="⚠️ Situations à risque"
        empty="Rien d'inquiétant pour l'instant."
        emptyFiltered="Aucun résultat pour ce filtre."
        items={filteredRisks}
        filtered={activeFilters.size > 0}
        defaultOpen
        onSelectPlayer={onSelectPlayer}
      />
      <MercatoSection
        title="📈 Bonnes nouvelles"
        empty="Rien de particulier à signaler."
        emptyFiltered="Aucun résultat pour ce filtre."
        items={filteredOpportunities}
        filtered={activeFilters.size > 0}
        defaultOpen
        onSelectPlayer={onSelectPlayer}
      />
    </div>
  );
}

function MercatoSection({
  title,
  empty,
  emptyFiltered,
  items,
  filtered,
  defaultOpen,
  onSelectPlayer,
}: {
  title: string;
  empty: string;
  emptyFiltered: string;
  items: MercatoItem[];
  filtered: boolean;
  defaultOpen: boolean;
  onSelectPlayer: (playerSlug: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-lg bg-ink2 border border-line overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-line text-left"
      >
        <span className="font-display uppercase text-base leading-none">{title}</span>
        <span className="font-mono text-xs text-muted ml-auto">{items.length}</span>
        <span className={`text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          ▾
        </span>
      </button>

      {open &&
        (items.length === 0 ? (
          <p className="px-3 py-3 font-mono text-xs text-muted">{filtered ? emptyFiltered : empty}</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.card.playerSlug} className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => onSelectPlayer(item.card.playerSlug)}
                  className="w-full text-left flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-flood focus-visible:ring-inset rounded"
                >
                  {item.card.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
                    <img
                      src={item.card.picture}
                      alt=""
                      loading="lazy"
                      className="w-9 h-9 rounded-full object-cover bg-ink shrink-0"
                    />
                  ) : (
                    <span className="w-9 h-9 rounded-full bg-ink shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm truncate">{item.card.name}</p>
                    <p className="text-[11px] text-muted truncate">
                      {POSITION_SHORT[item.card.position] ?? item.card.position}
                      {item.card.club ? ` · ${item.card.club}` : ""}
                    </p>
                  </div>
                </button>

                <ul className="mt-1.5 pl-12 space-y-1">
                  {item.reasons.map((r) => (
                    <li key={r.code} className="font-mono text-[11px]">
                      <span className="font-bold">{r.label}</span>
                      {r.detail && <span className="text-muted"> · {r.detail}</span>}
                    </li>
                  ))}
                </ul>

                {item.transfer?.headlineUrl && (
                  <a
                    href={item.transfer.headlineUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="block mt-1 pl-12 text-[11px] text-muted hover:underline decoration-muted underline-offset-2 truncate"
                  >
                    ↗ {item.transfer.headlineTitle}
                    {item.transfer.headlineDate && ` · ${relativeDate(item.transfer.headlineDate)}`}
                  </a>
                )}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
