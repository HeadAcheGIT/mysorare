"use client";

import { useState } from "react";
import { POSITION_SHORT, type SquadCard } from "@/lib/types";
import { TRANSFER_STAGES } from "@/lib/services/transferStage";
import { relativeDate } from "@/lib/format";
import type { PlayerAlert } from "./AlertBadges";

// Keyed as `string`: `stage` arrives as untyped JSON off the wire (via
// PlayerAlert), same reasoning as AlertBadges.tsx.
const STAGE_META: Map<string, (typeof TRANSFER_STAGES)[number]> = new Map(TRANSFER_STAGES.map((s) => [s.id, s]));
const STAGE_RANK_DESC: string[] = [...TRANSFER_STAGES].sort((a, b) => b.rank - a.rank).map((s) => s.id);

const TONE_CLASS: Record<string, { dot: string; text: string }> = {
  muted: { dot: "bg-muted", text: "text-muted" },
  flood: { dot: "bg-flood", text: "text-flood" },
  warn: { dot: "bg-warn", text: "text-warn" },
};

/**
 * Every gallery player with a live transfer-stage signal, worst-kept-secret
 * first (officialisé at the top, simple interest at the bottom) — the one
 * screen meant to answer "what's moving in my galerie right now" without
 * scanning every card for a badge.
 *
 * No direct X/Twitter feed behind this — see lib/services/transferStage.ts
 * for why (X's search API is paid) and what stands in for it: two Google
 * News queries per player, one French one English, classified into the same
 * five stages, corroborated by counting distinct outlets. Every row links to
 * the actual headline; the corroboration count is the honesty check, not a
 * promise the stage is certain.
 */
export default function MercatoAlerts({
  squad,
  alertsBySlug,
  onSelectPlayer,
}: {
  squad: SquadCard[];
  alertsBySlug: Record<string, PlayerAlert[]>;
  onSelectPlayer: (playerSlug: string) => void;
}) {
  const [open, setOpen] = useState(true);

  // One row per player even if several cards are owned — cardSlug varies,
  // playerSlug does not, and alertsBySlug is already keyed by player.
  const seen = new Set<string>();
  const items = squad
    .map((c) => {
      if (seen.has(c.playerSlug)) return null;
      const transfer = (alertsBySlug[c.playerSlug] ?? []).find((a) => a.kind === "transfer" && a.stage);
      if (!transfer) return null;
      seen.add(c.playerSlug);
      return { card: c, alert: transfer };
    })
    .filter((x): x is { card: SquadCard; alert: PlayerAlert } => x != null)
    .sort((a, b) => STAGE_RANK_DESC.indexOf(a.alert.stage!) - STAGE_RANK_DESC.indexOf(b.alert.stage!));

  if (!items.length) return null;

  return (
    <section className="rounded-lg bg-ink2 border border-line overflow-hidden mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <span className="w-2 h-2 rounded-full shrink-0 bg-warn" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="font-display uppercase text-base leading-none block truncate">Mercato</span>
          <span className="text-[11px] text-muted block truncate mt-0.5">
            Rumeurs et transferts en cours sur tes joueurs — croisées sur plusieurs sources.
          </span>
        </span>
        <span className="font-mono text-xs text-muted shrink-0">{items.length}</span>
        <span className={`text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <ul className="border-t border-line divide-y divide-line">
          {items.map(({ card, alert }) => {
            const meta = STAGE_META.get(alert.stage!)!;
            const tone = TONE_CLASS[meta.tone];
            const corroborated = (alert.sourceCount ?? 0) > 1;
            return (
              <li key={card.playerSlug} className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => onSelectPlayer(card.playerSlug)}
                  className="w-full text-left flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-flood focus-visible:ring-inset rounded"
                >
                  {card.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
                    <img
                      src={card.picture}
                      alt=""
                      loading="lazy"
                      className="w-9 h-9 rounded-full object-cover bg-ink shrink-0"
                    />
                  ) : (
                    <span className="w-9 h-9 rounded-full bg-ink shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm truncate">{card.name}</p>
                    <p className="text-[11px] text-muted truncate">
                      {POSITION_SHORT[card.position] ?? card.position}
                      {card.club ? ` · ${card.club}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0 max-w-[45%]">
                    <p className={`font-mono text-[11px] font-bold flex items-center justify-end gap-1 ${tone.text}`}>
                      <span aria-hidden>{meta.icon}</span>
                      {meta.label}
                    </p>
                    <p className="font-mono text-[10px] text-muted mt-0.5">
                      {corroborated
                        ? `${alert.sourceCount} sources concordantes`
                        : alert.sourceCount === 1
                          ? "1 seule source — à vérifier"
                          : ""}
                    </p>
                  </div>
                </button>

                {alert.headlineUrl && (
                  <a
                    href={alert.headlineUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="block mt-1.5 pl-12 text-[11px] text-muted hover:underline decoration-muted underline-offset-2 truncate"
                  >
                    ↗ {alert.headlineTitle}
                    {alert.headlineDate && ` · ${relativeDate(alert.headlineDate)}`}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
