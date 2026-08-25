"use client";

import { useMemo, useState, type ReactNode } from "react";
import SeasonReport from "../SeasonReport";
import SortControl from "../SortControl";
import { compareNullable } from "@/lib/types";
import { generateSalesCsv } from "@/lib/accountingExport";
import type { PriceComposition } from "@/lib/accountingRoi";
import type { SortDirection } from "../GalleryFilters";

export type SaleRow = {
  cardSlug: string;
  playerSlug: string;
  playerName: string;
  rarity: string;
  season: number | null;
  serialNumber: number | null;
  boughtPrice: number | null;
  lastKnownPrice: number | null;
  lastFloorPrice: number | null;
  lastEstimatedPrice: number | null;
  soldPrice: number | null;
  soldAt: string | null;
  soldPriceApprox: boolean;
  boughtPriceApprox: boolean;
  source: string;
  detectedAt: string;
  currentFloor: number | null;
  changePct: number | null;
};

interface HistoryTabProps {
  sales: SaleRow[];
  salesLoading: boolean;
  compositions: Record<string, PriceComposition>;
  salesSyncing: boolean;
  syncSalesFromSorare: () => Promise<void>;
  onSelectPlayer: (playerSlug: string, extra?: ReactNode) => void;
  onError: (msg: string) => void;
}

type SaleSortKey = "date" | "price" | "change";
const SALE_SORTS: [SaleSortKey, string][] = [
  ["date", "Date"],
  ["price", "Prix de vente"],
  ["change", "Écart vs floor actuel"],
];
const SALE_DEFAULT_DIRECTION: Record<SaleSortKey, SortDirection> = {
  date: "desc",
  price: "desc",
  change: "desc",
};

export default function HistoryTab({
  sales,
  salesLoading,
  compositions,
  salesSyncing,
  syncSalesFromSorare,
  onSelectPlayer,
  onError,
}: HistoryTabProps) {
  const [saleSort, setSaleSort] = useState<SaleSortKey>("date");
  const [saleDirection, setSaleDirection] = useState<SortDirection>(SALE_DEFAULT_DIRECTION.date);

  const sortedSales = useMemo(() => {
    return [...sales].sort((a, b) => {
      if (saleSort === "price") {
        const refA = a.soldPrice ?? a.lastKnownPrice ?? a.lastFloorPrice;
        const refB = b.soldPrice ?? b.lastKnownPrice ?? b.lastFloorPrice;
        return compareNullable(refA, refB, saleDirection);
      }
      if (saleSort === "change") {
        return compareNullable(a.changePct, b.changePct, saleDirection);
      }
      const whenA = new Date(a.soldAt ?? a.detectedAt).getTime();
      const whenB = new Date(b.soldAt ?? b.detectedAt).getTime();
      return saleDirection === "asc" ? whenA - whenB : whenB - whenA;
    });
  }, [sales, saleSort, saleDirection]);

  const salesRecap = useMemo(() => {
    const confirmed = sales.filter((s) => s.source === "sorare_sync" && s.soldPrice != null);
    const withChange = confirmed.filter((s) => s.changePct != null);
    const goodCalls = withChange.filter((s) => s.changePct! <= 0).length;
    const badCalls = withChange.filter((s) => s.changePct! > 0).length;
    const withProfit = confirmed.filter((s) => s.boughtPrice != null);
    const totalProfit = withProfit.reduce((sum, s) => sum + (s.soldPrice! - s.boughtPrice!), 0);
    const approxCount = confirmed.filter((s) => s.soldPriceApprox).length;
    return {
      confirmedCount: confirmed.length,
      goodCalls,
      badCalls,
      totalProfit,
      profitCount: withProfit.length,
      approxCount,
    };
  }, [sales]);

  function exportCsv() {
    if (!sales.length) return;
    const csvContent = generateSalesCsv(sales, compositions);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `sorare-bilan-ventes-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-label="Historique" className="space-y-3">
      <div className="mb-6">
        <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">
          Bilan de la saison
        </h2>
        <SeasonReport onError={onError} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-display uppercase text-sm tracking-wide text-muted">Ventes</h2>
        {sales.length > 0 && (
          <button
            onClick={exportCsv}
            className="text-xs font-mono text-flood border border-flood/40 rounded-md px-2.5 py-1 hover:bg-flood/10"
            title="Exporter l'historique des ventes en fichier CSV avec décomposition crédits/cash"
          >
            📥 Exporter CSV
          </button>
        )}
      </div>

      <p className="font-mono text-xs text-muted mb-2">
        Cartes disparues de ta galerie — vendues ou transférées. « Synchroniser » va chercher tes vraies
        ventes chez Sorare (prix et date confirmés, historique complet) ; sans connexion, seule ta dernière
        valorisation SorareScore avant disparition est affichée, en estimation.
      </p>

      <button
        onClick={syncSalesFromSorare}
        disabled={salesSyncing}
        className="w-full border border-line font-bold py-2.5 rounded-md text-sm disabled:opacity-50"
      >
        {salesSyncing ? "Synchronisation…" : "Synchroniser depuis Sorare"}
      </button>

      {salesLoading && <p className="font-mono text-sm text-muted">Chargement…</p>}

      {!salesLoading && sales.length === 0 && (
        <p className="font-mono text-sm text-muted">Aucune carte vendue ou transférée détectée pour l&apos;instant.</p>
      )}

      {salesRecap.confirmedCount > 0 && (
        <div className="p-3 rounded-lg bg-ink2 border border-line grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Bons calls</p>
            <p className="font-display text-lg text-ok">
              {salesRecap.goodCalls}
              <span className="text-muted text-xs">/{salesRecap.goodCalls + salesRecap.badCalls}</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Plus/moins-value</p>
            <p className={`font-display text-lg ${salesRecap.totalProfit >= 0 ? "text-ok" : "text-warn"}`}>
              {salesRecap.profitCount > 0 ? (
                <>
                  {salesRecap.totalProfit >= 0 ? "+" : ""}
                  {salesRecap.totalProfit.toFixed(2)} €
                </>
              ) : (
                <span className="text-muted text-sm">—</span>
              )}
            </p>
          </div>
          <p className="col-span-2 text-[11px] font-mono text-muted">
            {salesRecap.confirmedCount} vente{salesRecap.confirmedCount === 1 ? "" : "s"} confirmée
            {salesRecap.confirmedCount === 1 ? "" : "s"} par Sorare
            {salesRecap.profitCount < salesRecap.confirmedCount &&
              ` (${salesRecap.confirmedCount - salesRecap.profitCount} sans prix d'achat connu)`}
            {salesRecap.approxCount > 0 &&
              ` · ${salesRecap.approxCount} converti${salesRecap.approxCount === 1 ? "" : "s"} depuis l'ETH (≈)`}
          </p>
        </div>
      )}

      {sales.length > 0 && (
        <SortControl
          sortKey={saleSort}
          onSortKey={(k) => {
            setSaleSort(k);
            setSaleDirection(SALE_DEFAULT_DIRECTION[k]);
          }}
          options={SALE_SORTS}
          direction={saleDirection}
          onDirection={setSaleDirection}
        />
      )}

      <ul className="flex flex-col gap-2">
        {sortedSales.map((s) => {
          const confirmed = s.source === "sorare_sync" && s.soldPrice != null;
          const reference = s.soldPrice ?? s.lastKnownPrice ?? s.lastFloorPrice;
          const profit = confirmed && s.boughtPrice != null ? s.soldPrice! - s.boughtPrice : null;
          const when = s.soldAt ?? s.detectedAt;
          return (
            <li key={s.cardSlug} className="p-3 rounded-lg bg-ink2 border border-line">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectPlayer(s.playerSlug)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="font-bold truncate">{s.playerName}</p>
                  <p className="text-xs text-muted truncate">
                    {s.rarity}
                    {s.season != null && ` · saison ${s.season}`}
                    {s.serialNumber != null && ` · #${s.serialNumber}`}
                    {" · "}
                    {new Date(when).toLocaleDateString("fr-FR")}
                  </p>
                </button>
                <a
                  href={`https://sorare.com/football/cards/${s.cardSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-xs text-muted border border-line rounded-md px-2 py-1 hover:text-white hover:border-flood/60"
                  aria-label={`Voir la carte de ${s.playerName} sur Sorare`}
                >
                  Carte ↗
                </a>
              </div>

              <div className="mt-2 font-mono text-xs flex flex-wrap gap-x-4 gap-y-1 text-muted">
                {s.boughtPrice != null && (
                  <span>
                    Acheté {s.boughtPrice.toFixed(2)} €{s.boughtPriceApprox && (
                      <span title="Converti depuis un montant en ETH au cours du jour de l'achat (CoinGecko)"> ≈</span>
                    )}
                  </span>
                )}
                {confirmed ? (
                  <span className="text-white">
                    Vendu {s.soldPrice!.toFixed(2)} €{s.soldPriceApprox && (
                      <span title="Converti depuis un montant en ETH au cours du jour de la vente (CoinGecko)"> ≈</span>
                    )}
                  </span>
                ) : (
                  reference != null && <span>Dernière valo (estimation) {reference.toFixed(2)} €</span>
                )}
                {s.currentFloor != null && <span>Floor actuel {s.currentFloor.toFixed(2)} €</span>}
              </div>

              {compositions[s.cardSlug] && (
                <p className="mt-1 font-mono text-[11px]">
                  {compositions[s.cardSlug].credit > 0 ? (
                    <>
                      <span className="text-muted">dont </span>
                      <span className="text-fg">
                        {compositions[s.cardSlug].wallet.toFixed(2)} € portefeuille
                      </span>
                      <span className="text-muted"> + </span>
                      <span className="text-limited">
                        {compositions[s.cardSlug].credit.toFixed(2)} € crédits
                      </span>
                      <span className="text-muted"> ({compositions[s.cardSlug].creditPct} %)</span>
                    </>
                  ) : (
                    <span className="text-muted">
                      payé intégralement du portefeuille ({compositions[s.cardSlug].wallet.toFixed(2)} €)
                    </span>
                  )}
                </p>
              )}

              {profit != null && (
                <p className={`mt-1 text-xs font-mono ${profit >= 0 ? "text-ok" : "text-warn"}`}>
                  {profit >= 0 ? "+" : ""}
                  {profit.toFixed(2)} € vs achat
                </p>
              )}

              {s.changePct != null ? (
                <p className={`mt-1 text-xs font-mono ${s.changePct > 0 ? "text-warn" : "text-ok"}`}>
                  {s.changePct > 0
                    ? `Le prix a monté de ${s.changePct.toFixed(0)}% depuis — vendre était discutable`
                    : `Le prix a baissé de ${Math.abs(s.changePct).toFixed(0)}% depuis — bon call`}
                </p>
              ) : (
                <p className="mt-1 text-xs font-mono text-muted">Pas assez de données pour comparer</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
