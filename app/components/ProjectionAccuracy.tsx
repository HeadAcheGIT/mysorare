"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

type Source = { graded: number; hits: number; hitRate: number | null; brierScore: number | null };
type Overall = {
  ours: Source;
  sorare: Source;
  fixtures: number;
  perFixture: {
    fixtureSlug: string;
    startDate: string | null;
    graded: number;
    ours: Source;
    sorare: Source;
  }[];
};

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)} %`);
const brier = (v: number | null) => (v == null ? "—" : v.toFixed(3));

/**
 * How right the starting probabilities have actually been.
 *
 * This is the one screen that makes the rest of the app falsifiable. Every
 * projection, every recommended line-up rests on p(start); without a score
 * against real outcomes there is no way to know whether any of it is worth
 * following — and the grading was already computed and simply never rendered.
 *
 * Both models are shown side by side on purpose. "78 % correct" means nothing
 * alone; "78 % against Sorare's 81 %" tells you which number to trust when the
 * two disagree.
 */
export default function ProjectionAccuracy() {
  const [data, setData] = useState<Overall | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<Overall>("/api/lineups/aligned?all=1"));
    } catch {
      // Optional panel: a failure here must not take the tab down.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="font-mono text-xs text-muted">Calcul de la fiabilité…</p>;
  if (!data || data.ours.graded === 0) {
    return (
      <p className="font-mono text-xs text-muted">
        Pas encore de compo alignée jouée à comparer. Lance « Tout synchroniser » après une game week pour
        commencer à noter les probabilités.
      </p>
    );
  }

  const { ours, sorare } = data;
  // Brier is a squared error: lower wins, and the gap is what matters.
  const better =
    ours.brierScore != null && sorare.brierScore != null
      ? ours.brierScore < sorare.brierScore
        ? "nous"
        : ours.brierScore > sorare.brierScore
          ? "sorare"
          : "égalité"
      : null;

  const Cell = ({ label, source, highlight }: { label: string; source: Source; highlight: boolean }) => (
    <div className={`bg-ink rounded-md px-3 py-2 ${highlight ? "ring-1 ring-ok" : ""}`}>
      <p className="text-[10px] font-mono uppercase tracking-wide text-muted">{label}</p>
      <p className="font-display text-xl leading-tight">{pct(source.hitRate)}</p>
      <p className="font-mono text-[10px] text-muted">
        Brier {brier(source.brierScore)} · {source.graded} jugé{source.graded > 1 ? "s" : ""}
      </p>
    </div>
  );

  return (
    <div className="space-y-2">
      <h2 className="font-display uppercase text-sm tracking-wide text-muted">Fiabilité des probabilités</h2>

      <div className="grid grid-cols-2 gap-2">
        <Cell label="Notre modèle" source={ours} highlight={better === "nous"} />
        <Cell label="Sorare" source={sorare} highlight={better === "sorare"} />
      </div>

      <p className="font-mono text-[11px] text-muted">
        Sur {data.fixtures} game week{data.fixtures > 1 ? "s" : ""} jouée{data.fixtures > 1 ? "s" : ""}. Le
        pourcentage est la part de titularisations correctement annoncées. Le score de Brier mesure
        l&apos;écart entre la probabilité affichée et ce qui s&apos;est produit — <strong>plus bas est
        meilleur</strong>, et il sanctionne surtout la confiance mal placée : annoncer 95 % pour un joueur
        laissé sur le banc coûte bien plus cher qu&apos;annoncer 60 %.
      </p>

      {better === "sorare" && (
        <p className="font-mono text-[11px] text-warn">
          Sorare est actuellement mieux calibré. En cas de désaccord, suis plutôt son chiffre.
        </p>
      )}
      {better === "nous" && (
        <p className="font-mono text-[11px] text-ok">
          Notre modèle est mieux calibré que Sorare sur cet historique.
        </p>
      )}

      {data.perFixture.length > 1 && (
        <details className="mt-1">
          <summary className="font-mono text-[11px] text-muted cursor-pointer">Détail par game week</summary>
          <ul className="mt-1 space-y-1">
            {data.perFixture.map((f) => (
              <li key={f.fixtureSlug} className="font-mono text-[10px] text-muted flex justify-between gap-2">
                <span className="truncate">{f.fixtureSlug}</span>
                <span className="shrink-0">
                  nous {pct(f.ours.hitRate)} · Sorare {pct(f.sorare.hitRate)} · {f.graded} joueur
                  {f.graded > 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
