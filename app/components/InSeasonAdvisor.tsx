"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { POSITION_SHORT } from "@/lib/types";

type OpportunityStatus = "lineup_in" | "ready" | "close" | "far" | "locked";

type CostEstimate = {
  total: number | null;
  perPosition: { position: string; eur: number | null; sampleSize: number }[];
};

type Opportunity = {
  divisionSlug: string;
  displayName: string;
  trackName: string;
  division: number | null;
  rarityType: string | null;
  status: OpportunityStatus;
  label: string;
  missingCards: number;
  missingPositions: string[];
  prizePool: number | null;
  prizePoolCurrency: string | null;
  cost: CostEstimate | null;
  affordable: boolean | null;
  eligibility: { position: string; totalCount: number; usedCardsCount: number; available: number }[];
  transferMarketFilters: string | null;
};

type Advice = {
  fixture: string;
  budgetEur: number | null;
  budgetSource: "sorare" | "manual" | "unknown";
  opportunities: Opportunity[];
  costUnavailable: boolean;
};

const msg = (err: unknown) => (err instanceof Error ? err.message : "Erreur");
const eur = (v: number) => `${Math.round(v)} €`;

const STATUS_STYLE: Record<OpportunityStatus, { dot: string; text: string }> = {
  ready: { dot: "bg-ok", text: "text-ok" },
  lineup_in: { dot: "bg-flood", text: "text-flood" },
  close: { dot: "bg-limited", text: "text-limited" },
  far: { dot: "bg-warn", text: "text-warn" },
  locked: { dot: "bg-muted", text: "text-muted" },
};

/**
 * "Sur quelle division in-season me lancer ?" — divisions ranked by how close
 * they are to playable, weighted by what they pay, against a budget.
 *
 * The eligibility half is Sorare's own verdict. The cost half is an estimate
 * from the in-season valuations already in the gallery, and says so — see
 * marketSamplesFromGallery in lib/services/divisionAdvisor.ts for the
 * trade-off behind that choice.
 */
export default function InSeasonAdvisor({
  fixture,
  onError,
}: {
  fixture: string | null;
  onError: (message: string) => void;
}) {
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [loading, setLoading] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [appliedBudget, setAppliedBudget] = useState<string>("");

  const load = useCallback(
    async (fixtureSlug: string, budget: string) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ fixture: fixtureSlug });
        if (budget) qs.set("budget", budget);
        setAdvice(await apiFetch<Advice>(`/api/divisions/advice?${qs}`));
      } catch (err) {
        onError(msg(err));
      } finally {
        setLoading(false);
      }
    },
    [onError]
  );

  useEffect(() => {
    if (fixture) load(fixture, appliedBudget);
  }, [fixture, appliedBudget, load]);

  if (!fixture) return null;

  const budgetLabel =
    advice?.budgetEur == null
      ? "inconnu"
      : `${eur(advice.budgetEur)}${advice.budgetSource === "sorare" ? " (solde Sorare)" : " (saisi)"}`;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <input
          value={budgetInput}
          onChange={(e) => setBudgetInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setAppliedBudget(budgetInput.trim())}
          inputMode="decimal"
          placeholder="Budget € (vide = solde Sorare)"
          aria-label="Budget disponible en euros"
          className="flex-1 min-w-0 bg-ink border border-line rounded-md px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => setAppliedBudget(budgetInput.trim())}
          className="shrink-0 border border-line rounded-md px-3 py-2 text-sm"
        >
          Appliquer
        </button>
      </div>

      <p className="font-mono text-[11px] text-muted">
        Budget pris en compte : <span className="text-white">{budgetLabel}</span>
      </p>

      {loading && <p className="font-mono text-sm text-muted">Analyse…</p>}

      {!loading && advice && advice.opportunities.length === 0 && (
        <p className="font-mono text-sm text-muted">
          Aucune division in-season synchronisée — tape « Actualiser » sur le tableau ci-dessus.
        </p>
      )}

      {!loading && advice && advice.opportunities.length > 0 && (
        <>
          {advice.costUnavailable && (
            <p className="text-xs text-limited bg-limited/10 border border-limited/40 rounded-md px-2.5 py-2">
              Aucune valorisation in-season en base : les estimations de coût restent vides. Importe ton CSV
              SorareScore pour les activer.
            </p>
          )}

          <ul className="flex flex-col gap-2">
            {advice.opportunities.map((o) => {
              const tone = STATUS_STYLE[o.status];
              return (
                <li key={`${o.trackName}:${o.divisionSlug}`} className="p-3 rounded-lg bg-ink2 border border-line">
                  <div className="flex items-start gap-2.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${tone.dot}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold truncate">
                        {o.displayName}
                        <span className="text-muted font-normal text-xs"> · {o.trackName}</span>
                      </p>
                      <p className={`text-xs mt-0.5 ${tone.text}`}>{o.label}</p>
                    </div>
                    {o.prizePool != null && (
                      <div className="text-right shrink-0">
                        <p className="font-display text-lg leading-none text-flood">{Math.round(o.prizePool)}</p>
                        <p className="text-[10px] font-mono text-muted">{o.prizePoolCurrency ?? "dotation"}</p>
                      </div>
                    )}
                  </div>

                  {o.eligibility.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {o.eligibility.map((e) => (
                        <span
                          key={e.position}
                          className="text-[10px] font-mono bg-ink rounded px-1.5 py-0.5"
                          title={`${e.usedCardsCount} déjà engagée(s) sur ${e.totalCount}`}
                        >
                          {POSITION_SHORT[e.position] ?? e.position}{" "}
                          <span className={e.available > 0 ? "text-ok" : "text-warn"}>{e.available}</span>
                          <span className="text-muted">/{e.totalCount}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {o.cost && o.cost.perPosition.length > 0 && (
                    <div className="mt-2 font-mono text-[11px] text-muted">
                      <p>
                        Coût estimé :{" "}
                        {o.cost.total != null ? (
                          <span className={o.affordable === false ? "text-warn" : "text-white"}>
                            ~{eur(o.cost.total)}
                          </span>
                        ) : (
                          <span className="text-muted">inconnu (pas de référence pour tous les postes)</span>
                        )}
                        {o.affordable === false && " · au-dessus du budget"}
                        {o.affordable === true && " · dans le budget"}
                      </p>
                      <p className="mt-0.5">
                        {o.cost.perPosition
                          .map(
                            (p) =>
                              `${POSITION_SHORT[p.position] ?? p.position} ${p.eur != null ? `~${eur(p.eur)}` : "?"}`
                          )
                          .join(" · ")}
                      </p>
                      <p className="mt-0.5 text-muted/70">
                        Médiane des cartes in-season de ta galerie à ce poste — ordre de grandeur, pas un prix
                        de marché.
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
