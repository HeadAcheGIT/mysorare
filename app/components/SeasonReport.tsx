"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

type GameWeekResult = {
  fixtureSlug: string;
  gameWeek: number | null;
  entries: {
    leaderboardName: string;
    division: number | null;
    ranking: number | null;
    score: number | null;
    rewardEur: number | null;
    rewardCards: number;
  }[];
  totalEur: number;
  totalCards: number;
  pending: boolean;
};

type SeasonSummary = {
  gameWeeks: GameWeekResult[];
  totalEur: number;
  totalCards: number;
  lineupsPlayed: number;
  spentEur: number | null;
  netEur: number | null;
  bestRanking: { ranking: number; leaderboardName: string; gameWeek: number | null } | null;
};

const eur = (v: number) => `${v.toFixed(2)} €`;
const msg = (err: unknown) => (err instanceof Error ? err.message : "Erreur");

/**
 * The only screen in the app showing money that was actually won rather than
 * projected. Answers the question the rest of the app can only guess at: is
 * this gallery paying for itself?
 */
export default function SeasonReport({ onError }: { onError: (message: string) => void }) {
  const [data, setData] = useState<SeasonSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<SeasonSummary>("/api/rewards"));
    } catch (err) {
      onError(msg(err));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function sync() {
    setSyncing(true);
    try {
      await apiFetch("/api/rewards/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      await load();
    } catch (err) {
      onError(msg(err));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={sync}
        disabled={syncing}
        className="w-full border border-line font-bold py-2.5 rounded-md text-sm disabled:opacity-50"
      >
        {syncing ? "Synchronisation…" : "Récupérer mes résultats et gains"}
      </button>

      {loading && <p className="font-mono text-sm text-muted">Chargement…</p>}

      {!loading && data && data.lineupsPlayed === 0 && (
        <p className="font-mono text-sm text-muted">
          Aucun résultat synchronisé. Tape le bouton ci-dessus pour aller chercher tes classements et tes
          gains sur Sorare (connexion requise, onglet Données).
        </p>
      )}

      {!loading && data && data.lineupsPlayed > 0 && (
        <>
          <div className="p-3 rounded-lg bg-ink2 border border-line grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Gains</p>
              <p className="font-display text-lg text-ok">{eur(data.totalEur)}</p>
              {data.totalCards > 0 && (
                <p className="text-[10px] font-mono text-muted">
                  + {data.totalCards} carte{data.totalCards > 1 ? "s" : ""}
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Net vs achats</p>
              {data.netEur != null ? (
                <p className={`font-display text-lg ${data.netEur >= 0 ? "text-ok" : "text-warn"}`}>
                  {data.netEur >= 0 ? "+" : ""}
                  {eur(data.netEur)}
                </p>
              ) : (
                // Showing the winnings alone as a result would flatter it by
                // exactly what the cards cost.
                <p className="font-display text-lg text-muted">—</p>
              )}
              <p className="text-[10px] font-mono text-muted">
                {data.spentEur != null
                  ? `${eur(data.spentEur)} d'achats connus`
                  : "prix d'achat inconnus — importe ton CSV"}
              </p>
            </div>
            <p className="col-span-2 text-[11px] font-mono text-muted">
              {data.lineupsPlayed} compo{data.lineupsPlayed > 1 ? "s" : ""} sur {data.gameWeeks.length} game
              week{data.gameWeeks.length > 1 ? "s" : ""}
              {data.bestRanking &&
                ` · meilleur classement ${data.bestRanking.ranking}ᵉ (${data.bestRanking.leaderboardName})`}
            </p>
          </div>

          <ul className="flex flex-col gap-2">
            {data.gameWeeks.map((gw) => (
              <li key={gw.fixtureSlug} className="p-3 rounded-lg bg-ink2 border border-line">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-bold">
                    {gw.gameWeek != null ? `GW${gw.gameWeek}` : gw.fixtureSlug}
                  </p>
                  <p className={`font-mono text-sm ${gw.totalEur > 0 ? "text-ok" : "text-muted"}`}>
                    {eur(gw.totalEur)}
                    {gw.totalCards > 0 && ` · ${gw.totalCards} carte${gw.totalCards > 1 ? "s" : ""}`}
                    {gw.pending && <span className="text-muted"> · en attente</span>}
                  </p>
                </div>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {gw.entries.map((e, i) => (
                    <li key={i} className="font-mono text-[11px] text-muted flex justify-between gap-2">
                      <span className="truncate">{e.leaderboardName}</span>
                      <span className="shrink-0">
                        {e.ranking != null ? `${e.ranking}ᵉ` : "—"}
                        {e.score != null && ` · ${e.score.toFixed(0)} pts`}
                        {e.rewardEur ? ` · ${eur(e.rewardEur)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
