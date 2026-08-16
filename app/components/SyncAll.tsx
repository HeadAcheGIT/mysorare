"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import {
  SYNC_STEPS,
  runSyncSteps,
  skipReason,
  summarizeSyncRun,
  type StepOutcome,
} from "@/lib/syncSteps";

const ICON: Record<StepOutcome["status"], string> = {
  ok: "✓",
  skipped: "–",
  error: "✕",
};

const TONE: Record<StepOutcome["status"], string> = {
  ok: "text-ok",
  skipped: "text-muted/60",
  error: "text-warn",
};

/**
 * One button for everything Sorare.
 *
 * The alternative was nine separate actions spread across three screens, with
 * nothing to say which mattered or in what order. Steps run in sequence and a
 * failure doesn't stop the run — they're independent, so losing eight of them
 * because a session expired on the second would be the worst outcome.
 *
 * Every step stays individually runnable below, because when one fails that's
 * the one you want to retry, not the whole twenty-minute sequence.
 */
export default function SyncAll({
  fixture,
  signedIn,
  onDone,
  onError,
}: {
  fixture: string | null;
  signedIn: boolean;
  onDone: (summary: string) => void;
  onError: (message: string) => void;
}) {
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<StepOutcome[]>([]);

  const ctx = {
    fixture,
    signedIn,
    onProgress: (key: string, message: string) => setProgress((p) => ({ ...p, [key]: message })),
    fetchJson: apiFetch,
  };

  async function runAll() {
    setRunning("__all__");
    setOutcomes([]);
    setProgress({});
    try {
      const done = await runSyncSteps({
        ...ctx,
        onProgress: (key, message) => {
          setRunning(key);
          setProgress((p) => ({ ...p, [key]: message }));
        },
      });
      setOutcomes(done);
      onDone(summarizeSyncRun(done));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erreur de synchronisation");
    } finally {
      setRunning(null);
    }
  }

  async function runOne(key: string) {
    const step = SYNC_STEPS.find((s) => s.key === key);
    if (!step) return;
    setRunning(key);
    try {
      const done = await runSyncSteps({ ...ctx, onProgress: ctx.onProgress }, [step]);
      setOutcomes((prev) => [...prev.filter((o) => o.key !== key), ...done]);
      onDone(summarizeSyncRun(done));
    } finally {
      setRunning(null);
    }
  }

  const busy = running !== null;
  const skippable = SYNC_STEPS.filter((s) => skipReason(s, { fixture, signedIn }));

  return (
    <div className="space-y-3">
      <button
        onClick={runAll}
        disabled={busy}
        className="w-full bg-flood text-ink font-bold py-3 rounded-md text-sm disabled:opacity-50"
      >
        {running === null ? "↻ Tout synchroniser avec Sorare" : "Synchronisation…"}
      </button>

      <p className="font-mono text-xs text-muted">
        Enchaîne les {SYNC_STEPS.length} synchronisations dans l&apos;ordre. Une étape qui échoue
        n&apos;interrompt pas les suivantes. Compte plusieurs minutes sur une grosse galerie sans clé API —
        la valorisation interroge un marché par requête.
      </p>

      {!signedIn && skippable.length > 0 && (
        <p className="font-mono text-xs text-muted bg-ink rounded-md px-3 py-2">
          Sans connexion Sorare, {skippable.length} étape(s) seront ignorées :{" "}
          {skippable.map((s) => s.label).join(", ")}. Le reste fonctionne sur l&apos;API publique.
        </p>
      )}

      <ul className="space-y-1">
        {SYNC_STEPS.map((s) => {
          const outcome = outcomes.find((o) => o.key === s.key);
          const skip = skipReason(s, { fixture, signedIn });
          const active = running === s.key;
          return (
            <li key={s.key} className="bg-ink rounded-md px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm">
                    {outcome && <span className={`font-mono ${TONE[outcome.status]}`}>{ICON[outcome.status]} </span>}
                    {s.label}
                    {s.needsSession && (
                      <span className="ml-1.5 text-[10px] font-mono text-muted/70">session</span>
                    )}
                  </p>
                  <p className="font-mono text-[11px] text-muted">
                    {active
                      ? (progress[s.key] ?? "…")
                      : outcome
                        ? outcome.message
                        : (skip ?? s.detail)}
                  </p>
                </div>
                <button
                  onClick={() => runOne(s.key)}
                  disabled={busy || Boolean(skip)}
                  className="shrink-0 text-[11px] border border-line rounded-md px-2 py-1 disabled:opacity-40"
                >
                  {active ? "…" : "Lancer"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
