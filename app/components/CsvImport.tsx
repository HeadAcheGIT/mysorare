"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

type ImportResult = { cards: number; players: number; removed: number; skipped: string[] };

type Phase = "idle" | "reading" | "importing" | "enriching" | "projecting" | "done";

const STEPS: { phase: Phase; label: string }[] = [
  { phase: "reading", label: "Lecture du fichier" },
  { phase: "importing", label: "Import de la galerie" },
  { phase: "enriching", label: "Photos et stats" },
  { phase: "projecting", label: "Projections" },
];

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Uploads a SorareScore "my gallery" CSV, then walks enrichment and projection
 * to completion so the app is usable in one action — importing alone would
 * leave a gallery of blank avatars and no projections to build a line-up from.
 *
 * Each phase reports its own progress: a 400-card import takes a while, and
 * without that feedback a long silence is indistinguishable from a hang.
 */
export default function CsvImport({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = phase !== "idle" && phase !== "done";

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setProgress(null);

    try {
      setPhase("reading");
      const text = await file.text();

      setPhase("importing");
      const imported = await apiFetch<ImportResult>("/api/import", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: text,
      });
      setResult(imported);

      setPhase("enriching");
      let guard = 0;
      for (;;) {
        const batch = await apiFetch<{ processed: number; remaining: number; total: number; failed: number }>(
          "/api/enrich",
          { method: "POST" }
        );
        setProgress({ done: batch.total - batch.remaining, total: batch.total });
        if (batch.failed > 0) throw new Error(`${batch.failed} lot(s) en échec — voir le Journal pour le détail.`);
        // processed === 0 means nothing was due — stop rather than spin.
        if (batch.remaining === 0 || batch.processed === 0) break;
        if (++guard > 60) break;
      }

      setPhase("projecting");
      setProgress(null);
      await apiFetch("/api/gameweek", { method: "POST" });

      setPhase("done");
      onDone();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Import impossible";
      // A 504 here is the function hitting its time limit, which says nothing
      // useful on its own — name what to do about it instead.
      setError(
        /504|timeout|Gateway/i.test(raw)
          ? "Délai dépassé côté serveur. Relance l'import : ce qui est déjà écrit est conservé, seul le reste sera repris."
          : raw
      );
      setPhase("idle");
    }
  }

  const currentIndex = STEPS.findIndex((s) => s.phase === phase);

  return (
    <div className="p-3 rounded-lg bg-ink2 border border-line space-y-3">
      <div>
        <p className="text-sm font-bold">Importer ma galerie</p>
        <p className="text-xs text-muted">
          Export CSV « my gallery » depuis SorareScore. Aucune connexion Sorare nécessaire.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = ""; // allow re-picking the same file after a fix
        }}
      />

      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="w-full bg-flood text-ink font-bold py-2.5 rounded-md text-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {busy && <Spinner />}
        {busy ? "Import en cours…" : "Choisir un fichier CSV"}
      </button>

      {busy && (
        <ol className="space-y-1.5" aria-live="polite">
          {STEPS.map((s, i) => {
            const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "todo";
            return (
              <li
                key={s.phase}
                className={`flex items-center gap-2 font-mono text-xs ${
                  state === "todo" ? "text-muted/50" : state === "done" ? "text-ok" : "text-white"
                }`}
              >
                <span className="w-4 shrink-0 text-center" aria-hidden>
                  {state === "done" ? "✓" : state === "active" ? "▸" : "·"}
                </span>
                <span className="flex-1">{s.label}</span>
                {state === "active" && s.phase === "enriching" && progress && progress.total > 0 && (
                  <span className="text-muted">
                    {progress.done}/{progress.total}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {busy && phase === "enriching" && progress && progress.total > 0 && (
        <div className="bar-track">
          <span
            className="bar-fill transition-[width] duration-300"
            style={{ width: `${Math.min(100, (progress.done / progress.total) * 100)}%` }}
          />
        </div>
      )}

      {result && !busy && !error && (
        <p className="font-mono text-xs text-ok">
          ✓ {result.cards} cartes · {result.players} joueurs
          {result.removed > 0 && ` · ${result.removed} retirées`}
          {result.skipped.length > 0 && ` · ${result.skipped.length} ignorées`}
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-warn bg-warn/10 border border-warn/40 rounded-md px-2.5 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
