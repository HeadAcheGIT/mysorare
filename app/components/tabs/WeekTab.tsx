"use client";

import type { ReactNode } from "react";
import Deadline, { type GameWeek } from "../Deadline";
import DataHealth from "../DataHealth";
import GallerySummary from "../GallerySummary";
import InsightList, { type InsightGroup } from "../InsightList";
import CsvImport from "../CsvImport";
import AccountingImport from "../AccountingImport";
import PullToRefresh from "../PullToRefresh";
import { CardListSkeleton } from "../Skeleton";
import type { SquadCard } from "@/lib/types";

interface WeekTabProps {
  gameWeek: GameWeek | null;
  unenriched: number;
  squad: SquadCard[];
  squadLoadFailed: boolean;
  insights: InsightGroup[];
  insightsLoading: boolean;
  refreshAll: () => Promise<void>;
  openPlayer: (playerSlug: string, extra?: ReactNode) => void;
  loadSales: () => Promise<void>;
}

export default function WeekTab({
  gameWeek,
  unenriched,
  squad,
  squadLoadFailed,
  insights,
  insightsLoading,
  refreshAll,
  openPlayer,
  loadSales,
}: WeekTabProps) {
  return (
    <PullToRefresh onRefresh={refreshAll}>
      <section aria-label="Cette semaine" className="space-y-4">
        {gameWeek && <Deadline gw={gameWeek} />}
        <DataHealth unenriched={unenriched} onDone={refreshAll} />

        {squad.length === 0 && squadLoadFailed ? (
          <div className="text-center py-4">
            <p className="font-display text-xl uppercase mb-1 text-warn">Galerie indisponible</p>
            <p className="text-sm text-muted">
              Impossible de vérifier tes cartes pour l&apos;instant — voir le message d&apos;erreur ci-dessus.
              Rien n&apos;indique que ta galerie est vide.
            </p>
          </div>
        ) : squad.length === 0 ? (
          <div className="space-y-4">
            <div className="text-center py-4">
              <p className="font-display text-xl uppercase mb-1">Aucune donnée</p>
              <p className="text-sm text-muted">
                Importe l&apos;export CSV de ta galerie SorareScore pour démarrer.
              </p>
            </div>
            <CsvImport onDone={refreshAll} />
            <AccountingImport onImported={loadSales} />
          </div>
        ) : (
          <>
            <p className="font-mono text-xs text-muted -mt-1">
              Ce qui mérite une décision avant la clôture des compos — indisponibles, valeurs sûres,
              cartes à vendre. Les rumeurs et tendances de titularisation sont dans l&apos;onglet Mercato.
            </p>
            <GallerySummary cards={squad} />

            {insightsLoading ? (
              <div className="space-y-2">
                <p className="font-mono text-xs text-muted">Analyse en cours…</p>
                <CardListSkeleton count={3} />
              </div>
            ) : insights.length === 0 ? (
              <p className="font-mono text-sm text-muted">
                Rien à signaler. Lance « Rafraîchir photos et stats » dans Données pour affiner l&apos;analyse.
              </p>
            ) : (
              <div className="space-y-3">
                {insights.map((g) => (
                  <InsightList key={g.kind} group={g} onSelectPlayer={openPlayer} />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </PullToRefresh>
  );
}
