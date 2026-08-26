"use client";

import { useState, type ReactNode } from "react";
import DivisionBoard from "../DivisionBoard";
import InSeasonAdvisor from "../InSeasonAdvisor";
import Debrief from "../Debrief";
import DivisionRoi from "../DivisionRoi";
import ProjectionAccuracy from "../ProjectionAccuracy";
import { benchRisks } from "@/lib/lineupBenchRisk";
import type { SquadCard } from "@/lib/types";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export type SavedLineup = {
  id: number;
  fixture: string;
  competition: string;
  cards: string[];
  captain: string | null;
  projectedTotal: number;
  createdAt: string;
};

interface LineupTabProps {
  currentFixture: string | null;
  fixture: string | null;
  squad: SquadCard[];
  savedLineups: SavedLineup[];
  onSelectPlayer: (playerSlug: string, extra?: ReactNode) => void;
  deleteSavedLineup: (id: number) => void;
  onError: (msg: string) => void;
}

export default function LineupTab({
  currentFixture,
  fixture,
  squad,
  savedLineups,
  onSelectPlayer,
  deleteSavedLineup,
  onError,
}: LineupTabProps) {
  const [bilanOpen, setBilanOpen] = useState(false);

  return (
    <section aria-label="Composition">
      <div>
        <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">
          Mes divisions
        </h2>
        <p className="font-mono text-xs text-muted mb-2">
          La compo optimale par division, à partir de ton vivier réel — validée par les règles Sorare.
        </p>
        <DivisionBoard
          currentFixture={currentFixture}
          onSelectPlayer={onSelectPlayer}
          onError={onError}
        />
      </div>

      <div className="mt-6">
        <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">
          Où me lancer en in-season
        </h2>
        <InSeasonAdvisor fixture={currentFixture} onError={onError} />
      </div>

      {savedLineups.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">Compos sauvegardées</h2>
          <ul className="flex flex-col gap-2">
            {savedLineups.map((l) => {
              // Only the still-open fixture can still be changed before lock —
              // a saved lineup for a closed one is history, graded by Debrief
              // below rather than flagged as an actionable risk here.
              const risks = l.fixture === currentFixture ? benchRisks(l.cards, squad) : [];
              return (
                <li key={l.id} className="p-3 rounded-lg bg-ink2 border border-line">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold truncate">
                        {l.competition} · <span className="text-flood">{l.projectedTotal}</span> pts
                      </p>
                      <p className="text-xs text-muted truncate">
                        {new Date(l.createdAt).toLocaleString("fr-FR")} · {l.cards.length} cartes
                      </p>
                    </div>
                    <button
                      onClick={() => deleteSavedLineup(l.id)}
                      className="shrink-0 text-xs text-warn border border-warn rounded-md px-2 py-1.5"
                    >
                      Suppr.
                    </button>
                  </div>
                  {risks.length > 0 && (
                    <ul className="mt-2 pt-2 border-t border-line space-y-1">
                      {risks.map((r) => (
                        <li key={r.cardSlug}>
                          <button
                            type="button"
                            onClick={() => onSelectPlayer(r.playerSlug)}
                            className="font-mono text-[11px] text-warn text-left"
                          >
                            ⚠️ {r.name} — {r.pStartBasis === "starts" ? "titu" : "joue"} {pct(r.pStart)}, risque de
                            banc
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-line">
        <button
          type="button"
          onClick={() => setBilanOpen((o) => !o)}
          aria-expanded={bilanOpen}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <span className="font-display uppercase text-sm tracking-wide text-muted">
            Bilan de la dernière compo
          </span>
          <span aria-hidden className="text-muted text-xs">{bilanOpen ? "▴" : "▾"}</span>
        </button>
        {bilanOpen && (
          <div className="mt-3 space-y-6">
            <Debrief fixture={fixture} />
            <DivisionRoi />
            <ProjectionAccuracy />
          </div>
        )}
      </div>
    </section>
  );
}
