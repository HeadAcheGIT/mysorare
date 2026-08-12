"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

/**
 * Says out loud when the analysis is running on incomplete data, and offers to
 * finish it.
 *
 * Without this the app looked confident and was wrong: a player whose public
 * data hadn't been fetched has no club recorded, which the insights read as
 * "sans club — ne peut plus marquer" for what was actually a first-choice
 * keeper. Those players are now excluded from the advice, which makes saying
 * how many are missing part of the job.
 */
export default function DataHealth({
  unenriched,
  onDone,
}: {
  unenriched: number;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (unenriched === 0 && !busy) return null;

  async function complete() {
    setBusy(true);
    setError(null);
    try {
      let guard = 0;
      for (;;) {
        const batch = await apiFetch<{ processed: number; remaining: number; total: number; failed: number }>(
          "/api/enrich",
          { method: "POST" }
        );
        setProgress({ done: batch.total - batch.remaining, total: batch.total });
        // A failed batch doesn't throw (one bad page shouldn't sink the rest),
        // but it must not read as a silent success either.
        if (batch.failed > 0) throw new Error(`${batch.failed} lot(s) en échec — voir le Journal pour le détail.`);
        // processed === 0 means nothing was due; stop rather than spin.
        if (batch.remaining === 0 || batch.processed === 0) break;
        // Belt and braces: never loop forever if the server stops converging.
        if (++guard > 60) break;
      }
      await apiFetch("/api/gameweek", { method: "POST" });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la récupération");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="rounded-lg border border-limited bg-limited/10 px-3 py-2.5 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-limited">Analyse partielle</p>
          <p className="text-xs text-muted">
            {busy
              ? "Récupération des clubs, photos et stats…"
              : `${unenriched} carte${unenriched > 1 ? "s" : ""} sans données Sorare, écartée${
                  unenriched > 1 ? "s" : ""
                } de l'analyse tant qu'on ne sait rien d'elles.`}
          </p>
        </div>
        <button
          onClick={complete}
          disabled={busy}
          className="shrink-0 text-xs bg-limited text-ink font-bold rounded-md px-3 py-1.5 disabled:opacity-60"
        >
          {busy ? "…" : "Compléter"}
        </button>
      </div>

      {progress && progress.total > 0 && (
        <>
          <div className="bar-track">
            <span
              className="bar-fill transition-[width] duration-300"
              style={{ width: `${Math.min(100, (progress.done / progress.total) * 100)}%` }}
            />
          </div>
          <p className="font-mono text-[11px] text-muted">
            {progress.done}/{progress.total} joueurs
          </p>
        </>
      )}

      {error && <p className="text-xs text-warn">{error}</p>}
    </div>
  );
}
