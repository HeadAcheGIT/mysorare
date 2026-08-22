"use client";

import { useMemo } from "react";
import { POSITION_SHORT, type SquadCard } from "@/lib/types";
import { buildMercatoLists, type MercatoItem } from "@/lib/mercatoBoard";
import type { MercatoSignalRow } from "@/lib/services/mercato";
import { relativeDate } from "@/lib/format";
import type { PlayerAlert } from "./AlertBadges";

/**
 * The Mercato tab: every gallery player worth watching right now, split into
 * what could go wrong and what could go right — a live transfer story (see
 * lib/services/alerts.ts), a starting-time trend, a form trend, or a
 * championship the market scouting tab can't search (see lib/mercatoBoard.ts
 * for exactly how each is decided and why nothing here guesses at a rumoured
 * transfer's destination).
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

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Ce qui bouge sur tes joueurs pendant le mercato, et ce que ça change pour tes compos — rumeurs
        croisées sur plusieurs sources, tendance de titularisation et de forme calculées depuis tes
        données, championnats hors du scouting marché.
      </p>

      <MercatoSection
        title="⚠️ Situations à risque"
        empty="Rien d'inquiétant pour l'instant."
        items={risks}
        onSelectPlayer={onSelectPlayer}
      />
      <MercatoSection
        title="📈 Bonnes nouvelles"
        empty="Rien de particulier à signaler."
        items={opportunities}
        onSelectPlayer={onSelectPlayer}
      />
    </div>
  );
}

function MercatoSection({
  title,
  empty,
  items,
  onSelectPlayer,
}: {
  title: string;
  empty: string;
  items: MercatoItem[];
  onSelectPlayer: (playerSlug: string) => void;
}) {
  return (
    <section className="rounded-lg bg-ink2 border border-line overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-line">
        <span className="font-display uppercase text-base leading-none">{title}</span>
        <span className="font-mono text-xs text-muted ml-auto">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="px-3 py-3 font-mono text-xs text-muted">{empty}</p>
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
      )}
    </section>
  );
}
