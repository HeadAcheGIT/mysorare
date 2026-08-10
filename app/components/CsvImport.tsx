"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

type ImportResult = { cards: number; players: number; removed: number; skipped: string[] };

/**
 * Uploads a SorareScore "my gallery" CSV, then walks the enrichment endpoint
 * to completion so photos, clubs, injuries and scores land in the same action
 * — importing without enriching would leave a gallery of blank avatars.
 */
export default function CsvImport({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      setStep("Lecture du fichier…");
      const text = await file.text();

      setStep("Import de la galerie…");
      const imported = await apiFetch<ImportResult>("/api/import", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: text,
      });
      setResult(imported);

      setStep("Récupération des photos et stats…");
      let cursor = 0;
      for (;;) {
        const batch = await apiFetch<{ processed: number; nextCursor: number | null; total: number }>(
          "/api/enrich",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cursor }),
          }
        );
        cursor += batch.processed;
        setProgress({ done: cursor, total: batch.total });
        if (batch.nextCursor === null) break;
        cursor = batch.nextCursor;
      }

      setStep("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import impossible");
    } finally {
      setBusy(false);
    }
  }

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
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = ""; // allow re-picking the same file after a fix
        }}
      />

      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="w-full bg-flood text-ink font-bold py-2.5 rounded-md text-sm disabled:opacity-50"
      >
        {busy ? step || "…" : "Choisir un fichier CSV"}
      </button>

      {progress && progress.total > 0 && (
        <div>
          <div className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${Math.min(100, (progress.done / progress.total) * 100)}%` }}
            />
          </div>
          <p className="font-mono text-xs text-muted mt-1">
            {progress.done}/{progress.total} joueurs enrichis
          </p>
        </div>
      )}

      {result && !busy && (
        <p className="font-mono text-xs text-ok">
          {result.cards} cartes · {result.players} joueurs
          {result.removed > 0 && ` · ${result.removed} retirées`}
          {result.skipped.length > 0 && ` · ${result.skipped.length} ignorées`}
        </p>
      )}

      {error && <p className="text-xs text-warn">{error}</p>}
    </div>
  );
}
