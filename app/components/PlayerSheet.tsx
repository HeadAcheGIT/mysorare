"use client";

import { useEffect } from "react";
import Sparkline from "./Sparkline";
import MatchList from "./MatchList";
import { POSITION_LABEL, rarityOf, type SquadCard } from "@/lib/types";

const one = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const eur = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)} €`);
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="bg-ink rounded-md px-3 py-2">
      <p className="text-[10px] font-mono uppercase tracking-wide text-muted">{label}</p>
      <p className={`font-display text-xl leading-tight ${tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : ""}`}>
        {value}
      </p>
    </div>
  );
}

/** Bottom sheet with the full detail for one card. */
export default function PlayerSheet({ card, onClose }: { card: SquadCard; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Stop the list behind the sheet from scrolling with it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const rarity = rarityOf(card.rarity);
  const profit = card.price != null && card.boughtPrice != null ? card.price - card.boughtPrice : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={card.name}
        className="relative w-full sm:max-w-md bg-ink2 border-t sm:border border-line sm:rounded-xl rounded-t-2xl max-h-[85vh] overflow-y-auto safe-bottom"
      >
        <div className={`flex items-center gap-3 p-4 border-b border-line border-l-[3px] ${rarity.border}`}>
          {card.picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
            <img src={card.picture} alt="" className="w-16 h-16 rounded-full object-cover bg-ink shrink-0" />
          ) : (
            <span className="w-16 h-16 rounded-full bg-ink shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl uppercase leading-none truncate">{card.name}</h2>
            <p className="text-xs text-muted truncate mt-1">
              {POSITION_LABEL[card.position] ?? card.position}
              {card.age != null && ` · ${card.age} ans`}
              {card.shirtNumber != null && ` · n°${card.shirtNumber}`}
            </p>
            <p className="text-xs text-muted truncate flex items-center gap-1.5 mt-0.5">
              {card.clubPicture && (
                // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
                <img src={card.clubPicture} alt="" className="w-4 h-4 object-contain" />
              )}
              {card.club ?? "sans club"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 w-8 h-8 grid place-items-center rounded-md border border-line text-muted"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {(card.injury || card.suspended) && (
            <p className="text-sm text-warn bg-warn/10 border border-warn/40 rounded-md px-3 py-2">
              {card.suspended ? "Suspendu" : `Blessé — ${card.injury}`}
            </p>
          )}

          <div>
            <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">Forme récente</p>
            <div className="flex items-center gap-3 bg-ink rounded-md px-3 py-2">
              <Sparkline scores={card.recentScores} width={140} height={34} />
              <span className="font-mono text-xs text-muted">
                {card.recentScores.length ? `${card.recentScores.length} matchs` : "—"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Projeté" value={one(card.expected)} />
            <Stat label="Sorare" value={one(card.sorareProjection)} />
            <Stat label="L10" value={one(card.l10)} />
            <Stat label="Titulaire" value={pct(card.pStart)} />
            <Stat label="L5" value={one(card.l5)} />
            <Stat label="L15" value={one(card.l15)} />
          </div>

          <div>
            <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">Marché</p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Prix" value={eur(card.price)} />
              <Stat label="Floor" value={eur(card.floorPrice)} />
              <Stat label="Estimé" value={eur(card.estimatedPrice)} />
              <Stat label="Acheté" value={eur(card.boughtPrice)} />
            </div>
            {profit != null && (
              <p className={`mt-2 font-mono text-sm ${profit >= 0 ? "text-ok" : "text-warn"}`}>
                {profit >= 0 ? "+" : ""}
                {profit.toFixed(2)} € depuis l&apos;achat
              </p>
            )}
          </div>

          <p className="font-mono text-[11px] text-muted">
            {rarity.label}
            {card.season != null && ` · saison ${card.season}`}
            {card.serial != null && ` · n° de série ${card.serial}`}
            {card.inSeason && " · in-season"}
          </p>

          <div>
            <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">Matchs</p>
            <div className="bg-ink rounded-md px-3 py-2">
              <MatchList slug={card.playerSlug} />
            </div>
          </div>

          <a
            href={`https://sorare.com/football/players/${card.playerSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-sm border border-line rounded-md py-2 text-muted"
          >
            Voir sur Sorare ↗
          </a>
        </div>
      </div>
    </div>
  );
}
