"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { POSITION_LABEL } from "@/lib/types";
import type { Upgrade } from "@/lib/buyAdvice";

type Result = {
  upgrades: Upgrade[];
  weakest: string | null;
  budget: number | null;
  watched: number;
  incomplete: number;
};

const eur = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)} €`);

/**
 * What to buy next, ranked by points added per euro.
 *
 * A cheap card with a good score isn't automatically a good buy: if you already
 * field someone better in that position it adds nothing. What decides a
 * purchase is the marginal gain, and that is what this ranks on.
 */
export default function BuyAdvice({
  fixture,
  onSelectPlayer,
}: {
  fixture: string | null;
  onSelectPlayer: (slug: string) => void;
}) {
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<Result>(`/api/buy${fixture ? `?fixture=${encodeURIComponent(fixture)}` : ""}`));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fixture]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="font-mono text-xs text-muted">Analyse des cibles…</p>;
  if (!data) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display uppercase text-sm tracking-wide text-muted">Quoi acheter</h2>
        <p className="font-mono text-[11px] text-muted shrink-0">
          {data.budget != null ? `budget ${eur(data.budget)}` : "budget inconnu"}
        </p>
      </div>

      {data.weakest && (
        <p className="font-mono text-[11px] text-muted">
          Poste le plus faible de ton effectif :{" "}
          <span className="text-fg">{POSITION_LABEL[data.weakest] ?? data.weakest}</span> — c&apos;est là
          qu&apos;un achat rapporte le plus.
        </p>
      )}

      {data.upgrades.length === 0 ? (
        <p className="font-mono text-xs text-muted">
          Aucune cible de ta watchlist n&apos;améliorerait ta compo actuelle.
          {data.incomplete > 0 &&
            ` ${data.incomplete} joueur(s) suivi(s) manquent encore d'une projection ou d'une valorisation — lance « Tout synchroniser ».`}
        </p>
      ) : (
        <ul className="space-y-2">
          {data.upgrades.map((u) => (
            <li key={u.playerSlug}>
              <button
                type="button"
                onClick={() => onSelectPlayer(u.playerSlug)}
                className={`w-full text-left bg-ink rounded-md px-3 py-2 border-l-[3px] hover:bg-line/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-flood ${
                  u.affordable === false ? "border-l-warn/50" : "border-l-ok"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-bold truncate">{u.playerName}</p>
                  <p className="font-mono text-xs shrink-0 text-ok">
                    +{u.gain.toFixed(0)} pts
                    {u.gainPerEuro != null && (
                      <span className="text-muted"> · {u.gainPerEuro.toFixed(1)} pt/€</span>
                    )}
                  </p>
                </div>

                <p className="font-mono text-[11px] text-muted">
                  {POSITION_LABEL[u.position] ?? u.position} · {eur(u.price)}
                  {u.currentBest != null
                    ? ` · ton meilleur à ce poste projette ${u.currentBest.toFixed(0)}`
                    : " · aucun joueur à ce poste"}
                  {u.affordable === false && <span className="text-warn"> · au-dessus du budget</span>}
                </p>

                {/* Both of these say the price or the projection can't carry a
                    decision on its own. */}
                {(u.thin || u.launchPremium) && (
                  <p className="font-mono text-[10px] text-warn">
                    {u.thin && "Échantillon de ventes maigre"}
                    {u.thin && u.launchPremium && " · "}
                    {u.launchPremium && "Sortie récente, prix pas stabilisé"}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="font-mono text-[10px] text-muted/70">
        Les cibles viennent de ta watchlist ({data.watched} joueur{data.watched > 1 ? "s" : ""} non
        possédé{data.watched > 1 ? "s" : ""}), pas du marché entier : scouter le marché coûterait une
        requête par joueur avant d&apos;afficher quoi que ce soit. Le gain compare le joueur à ton
        meilleur au même poste — c&apos;est une approximation, pas un recalcul complet de la compo.
      </p>
    </div>
  );
}
