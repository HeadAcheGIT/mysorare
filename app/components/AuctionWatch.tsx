"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

type Valuation = { value: number | null; sampleSize: number; launchPremium: boolean; thin: boolean } | null;

type Opportunity = {
  discountPct: number | null;
  minutesLeft: number | null;
  endingSoon: boolean;
  ended: boolean;
  verdict: "bonne_affaire" | "au_prix" | "trop_cher" | "inconnu";
};

type WatchedAuction = {
  cardSlug: string;
  playerSlug: string;
  playerName: string;
  rarity: string | null;
  seasonYear: number | null;
  inSeason: boolean;
  serialNumber: number | null;
  endDate: string;
  bidsCount: number;
  currentEur: number | null;
  currentApprox: boolean;
  valuation: Valuation;
  opportunity: Opportunity;
};

type Result = {
  auctions: WatchedAuction[];
  watchedCount: number;
  scanned: number;
  truncated: boolean;
};

const eur = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)} €`);
const msg = (err: unknown) => (err instanceof Error ? err.message : "Erreur");

const VERDICT: Record<Opportunity["verdict"], { label: string; cls: string }> = {
  bonne_affaire: { label: "sous le marché", cls: "text-ok" },
  au_prix: { label: "au prix du marché", cls: "text-muted" },
  trop_cher: { label: "au-dessus du marché", cls: "text-warn" },
  inconnu: { label: "pas assez de ventes pour juger", cls: "text-muted/70" },
};

function countdown(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes <= 0) return "terminée";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h} h ${minutes % 60} min`;
  return `${Math.floor(h / 24)} j ${h % 24} h`;
}

/**
 * Live auctions on watchlisted players.
 *
 * An auction in progress isn't a market price, it's a price so far — so each
 * row is shown against what those cards actually trade at, and ordered by the
 * only thing that makes one urgent: a good price with little time left.
 */
export default function AuctionWatch({
  onSelectPlayer,
  onError,
}: {
  onSelectPlayer: (slug: string) => void;
  onError: (message: string) => void;
}) {
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<Result>("/api/auctions"));
      setCheckedAt(new Date());
    } catch (err) {
      onError(msg(err));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  // A countdown that doesn't move is misleading, so the view re-renders each
  // minute off the timestamps already fetched — no extra requests.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const minutesLeft = (a: WatchedAuction) => {
    const end = Date.parse(a.endDate);
    return Number.isFinite(end) ? Math.floor((end - Date.now()) / 60_000) : a.opportunity.minutesLeft;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] text-muted">
          {checkedAt ? `Vérifié à ${checkedAt.toLocaleTimeString("fr-FR")}` : "…"}
          {data && ` · ${data.scanned} enchères parcourues`}
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="shrink-0 text-xs border border-line rounded-md px-3 py-1.5 disabled:opacity-50"
        >
          {loading ? "…" : "↻ Rafraîchir"}
        </button>
      </div>

      {loading && !data && <p className="font-mono text-sm text-muted">Recherche des enchères…</p>}

      {data && data.watchedCount === 0 && (
        <p className="font-mono text-sm text-muted">
          Aucun joueur suivi. Ajoute des cibles via « + Suivre » dans la recherche ci-dessus pour être
          prévenu quand leurs cartes passent aux enchères.
        </p>
      )}

      {data && data.watchedCount > 0 && data.auctions.length === 0 && (
        <p className="font-mono text-sm text-muted">
          Aucune enchère en cours sur tes {data.watchedCount} joueur{data.watchedCount > 1 ? "s" : ""} suivi
          {data.watchedCount > 1 ? "s" : ""}.
        </p>
      )}

      {data && data.auctions.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.auctions.map((a) => {
            const mins = minutesLeft(a);
            const v = VERDICT[a.opportunity.verdict];
            const urgent = mins != null && mins > 0 && mins <= 30;
            return (
              <li key={a.cardSlug}>
                <button
                  type="button"
                  onClick={() => onSelectPlayer(a.playerSlug)}
                  className={`w-full text-left p-3 rounded-lg bg-ink2 border border-line border-l-[3px] hover:bg-line/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-flood ${
                    a.opportunity.verdict === "bonne_affaire" ? "border-l-ok" : "border-l-line"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold truncate">{a.playerName}</p>
                      <p className="text-[11px] font-mono text-muted truncate">
                        {a.rarity}
                        {a.seasonYear != null && ` · ${a.seasonYear}`}
                        {a.serialNumber != null && ` · #${a.serialNumber}`}
                        {a.inSeason && " · in-season"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-display text-lg leading-none">
                        {eur(a.currentEur)}
                        {a.currentApprox && (
                          <span className="text-[10px] text-muted" title="Converti depuis l'ETH">
                            {" "}
                            ≈
                          </span>
                        )}
                      </p>
                      <p className={`text-[10px] font-mono ${urgent ? "text-warn" : "text-muted"}`}>
                        {countdown(mins)}
                        {a.bidsCount > 0 ? ` · ${a.bidsCount} offre${a.bidsCount > 1 ? "s" : ""}` : " · aucune offre"}
                      </p>
                    </div>
                  </div>

                  <p className={`mt-1.5 font-mono text-[11px] ${v.cls}`}>
                    {a.opportunity.discountPct != null && a.valuation?.value != null ? (
                      <>
                        {a.opportunity.discountPct > 0 ? "−" : "+"}
                        {Math.abs(a.opportunity.discountPct)}% vs {eur(a.valuation.value)} · {v.label}
                      </>
                    ) : (
                      v.label
                    )}
                    {a.valuation?.launchPremium && (
                      <span className="text-limited"> · sortie récente, prix pas encore stabilisé</span>
                    )}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {data?.truncated && (
        <p className="font-mono text-[10px] text-muted/70">
          Sorare ne permet pas de filtrer les enchères par joueur : l&apos;app parcourt le flux global et
          s&apos;arrête aux {data.scanned} enchères les plus récemment actives. D&apos;autres peuvent exister
          plus loin. Une clé SORARE_API_KEY élargit fortement la recherche (plafond de complexité 60× plus
          haut, 600 requêtes/min au lieu de 20).
        </p>
      )}
    </div>
  );
}
