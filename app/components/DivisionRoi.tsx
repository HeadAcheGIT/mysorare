"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { yieldVerdict, type DivisionRoi as Row } from "@/lib/divisionRoi";

const TONE = { ok: "text-ok", neutral: "text-flood", warn: "text-warn" } as const;
const eur = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)} €`);

/**
 * Which divisions actually pay for the capital they tie up.
 *
 * "Biggest prize pool" is the wrong question — a pool needing 400 € of cards
 * can return less per euro than a smaller one entered with 40 €. The capital
 * isn't spent, it's immobilised, so this is a return on capital employed and
 * the wording keeps that distinction.
 */
export default function DivisionRoi() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setRows(await apiFetch<Row[]>("/api/divisions/roi"));
    } catch {
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="font-mono text-xs text-muted">Calcul du rendement…</p>;
  if (!rows || !rows.length) {
    return (
      <p className="font-mono text-xs text-muted">
        Aucune récompense synchronisée. Lance « Tout synchroniser » pour alimenter le rendement par
        division.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="font-display uppercase text-sm tracking-wide text-muted">Rendement par division</h2>

      <ul className="space-y-2">
        {rows.map((r) => {
          const v = yieldVerdict(r);
          return (
            <li key={r.leaderboardSlug} className="bg-ink rounded-md px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-bold truncate">{r.leaderboardName ?? r.leaderboardSlug}</p>
                <p className={`font-display text-lg shrink-0 ${TONE[v.tone]}`}>
                  {r.yieldPct == null ? "—" : `${r.yieldPct > 0 ? "+" : ""}${r.yieldPct} %`}
                </p>
              </div>

              <p className="font-mono text-[11px] text-muted">
                {r.entries} entrée{r.entries > 1 ? "s" : ""} · {eur(r.totalEur)} encaissé
                {r.cardsWon > 0 && ` · ${r.cardsWon} carte${r.cardsWon > 1 ? "s" : ""} gagnée${r.cardsWon > 1 ? "s" : ""}`}
                {r.avgCapital != null && ` · ${eur(r.avgCapital)} immobilisés par compo`}
                {r.avgRanking != null && ` · rang moyen ${Math.round(r.avgRanking)}`}
              </p>

              <p className={`font-mono text-[11px] ${TONE[v.tone]}`}>
                {v.label}
                {r.unvalued > 0 && (
                  <span className="text-muted/70">
                    {" "}
                    · {r.unvalued} compo{r.unvalued > 1 ? "s" : ""} non valorisée{r.unvalued > 1 ? "s" : ""},
                    exclue{r.unvalued > 1 ? "s" : ""} du calcul
                  </span>
                )}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="font-mono text-[10px] text-muted/70">
        Le pourcentage est ce qui est <strong>revenu en cash</strong> rapporté à la valeur des cartes qu&apos;il
        a fallu immobiliser pour jouer. Ce capital n&apos;est pas dépensé — tu gardes les cartes — donc
        c&apos;est un rendement, pas une marge. Les cartes gagnées sont comptées à part : leur valeur
        n&apos;est pas incluse dans le pourcentage.
      </p>
    </div>
  );
}
