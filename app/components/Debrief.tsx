"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

type ScoredCard = { cardSlug: string; playerName: string; position: string; score: number | null };
type Division = {
  leaderboardName: string | null;
  division: number | null;
  officialTotal: number | null;
  regret: { actual: number; best: number; points: number; missed: ScoredCard[]; dropped: ScoredCard[] };
  verdict: { label: string; tone: "ok" | "neutral" | "warn" };
  poolSize: number;
};
type Result = { fixtureSlug: string; played: boolean; divisions: Division[]; poolApproximate: boolean };

const TONE = { ok: "text-ok", neutral: "text-flood", warn: "text-warn" } as const;
const pts = (v: number) => v.toFixed(0);

/**
 * The scoreboard for last game week's decisions.
 *
 * A total on its own says nothing — 210 points is neither good nor bad. What
 * teaches is the gap: 210 when 260 was sitting on the bench is a 50-point
 * mistake, with a name attached to it.
 */
export default function Debrief({ fixture }: { fixture: string | null }) {
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<Result>(`/api/debrief${fixture ? `?fixture=${encodeURIComponent(fixture)}` : ""}`));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fixture]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="font-mono text-xs text-muted">Analyse de la game week…</p>;
  if (!data || !data.divisions.length) {
    return (
      <p className="font-mono text-xs text-muted">
        Aucune compo alignée à analyser sur cette game week.
      </p>
    );
  }
  if (!data.played) {
    return (
      <p className="font-mono text-xs text-muted">
        Game week pas encore jouée — le débrief apparaîtra une fois les scores connus.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display uppercase text-sm tracking-wide text-muted">Débrief</h2>

      {data.divisions.map((d) => (
        <div key={`${d.leaderboardName}-${d.division}`} className="bg-ink rounded-md px-3 py-2 space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-bold truncate">{d.leaderboardName ?? "Division"}</p>
            <p className={`font-mono text-xs shrink-0 ${TONE[d.verdict.tone]}`}>{d.verdict.label}</p>
          </div>

          <p className="font-mono text-xs">
            <span className="text-muted">aligné </span>
            <span className="font-bold">{pts(d.regret.actual)}</span>
            <span className="text-muted"> · meilleur possible </span>
            <span className="font-bold">{pts(d.regret.best)}</span>
            {d.regret.points > 0 && (
              <span className={TONE.warn}> · −{pts(d.regret.points)} pts laissés</span>
            )}
          </p>

          {d.regret.missed.length > 0 && (
            <p className="font-mono text-[11px] text-muted">
              À la place :{" "}
              {d.regret.missed
                .slice(0, 3)
                .map((c) => `${c.playerName} (${c.score == null ? "—" : pts(c.score)})`)
                .join(", ")}
              {d.regret.dropped.length > 0 && (
                <>
                  {" au lieu de "}
                  {d.regret.dropped
                    .slice(0, 3)
                    .map((c) => `${c.playerName} (${c.score == null ? "n'a pas joué" : pts(c.score)})`)
                    .join(", ")}
                </>
              )}
            </p>
          )}

          {/* Sorare's own total, carried separately: it comes from a different
              source than the two figures above, which are compared to each
              other and must share a ruler. */}
          {d.officialTotal != null && (
            <p className="font-mono text-[10px] text-muted/70">
              Score officiel Sorare : {pts(d.officialTotal)} · vivier de {d.poolSize} cartes
            </p>
          )}
        </div>
      ))}

      <p className="font-mono text-[10px] text-muted/70">
        Le « meilleur possible » n&apos;utilise que des cartes déjà acquises avant la game week, et de la
        même rareté que celles alignées. Les cartes vendues depuis manquent au vivier, donc l&apos;écart
        est un <strong>minorant</strong> : tu n&apos;as jamais laissé moins que ça.
        {data.poolApproximate &&
          " Certaines cartes n'ont pas de date d'acquisition connue et sont incluses par défaut."}
      </p>
    </div>
  );
}
