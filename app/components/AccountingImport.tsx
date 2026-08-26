"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

type Summary = {
  lastEntryAt: string | null;
  importedAt: string | null;
  rows: number;
  totals: { out: number; in: number; net: number; fees: number };
  byYear: { year: number; out: number; in: number; net: number; cumulativeNet: number }[];
  creditCards: number;
  creditTotal: number;
};

const eur = (v: number) => `${v.toFixed(2)} €`;
const msg = (e: unknown) => (e instanceof Error ? e.message : "Erreur");

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : null;

/** Whole days since a date — what makes "stale" concrete rather than a feeling. */
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/**
 * Import of the Sorare accounting export, with how current it is.
 *
 * The ledger can't be synced usefully: `currentUser.accountEntries` exists over
 * the API but carries no card reference, so nothing in it can be attributed to
 * a card. The CSV can. Since that makes the data only as fresh as the last
 * manual export, the age of that export is shown rather than left to be
 * guessed — a ROI built on a three-week-old ledger should say so.
 */
export default function AccountingImport({ onImported }: { onImported?: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setSummary(await apiFetch<Summary>("/api/accounting"));
    } catch {
      // The rest of the tab must stay usable if this one call fails.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ parsed: number; added: number; known: number; skipped: number }>(
        "/api/accounting",
        { method: "POST", body: await file.text() }
      );
      setNotice(
        `${res.added} mouvement(s) ajouté(s)` +
          (res.known ? `, ${res.known} déjà connu(s)` : "") +
          (res.skipped ? `, ${res.skipped} sans montant ignoré(s)` : "")
      );
      await load();
      onImported?.();
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const age = daysSince(summary?.lastEntryAt ?? null);
  // Three weeks is roughly a Sorare season-pass cycle; past that a ROI figure
  // is describing a different portfolio than the one you hold.
  const stale = age != null && age > 21;

  return (
    <div className="space-y-3">
      <h2 className="font-display uppercase text-sm tracking-wide text-muted">Historique comptable</h2>

      {summary && summary.rows > 0 ? (
        <div className="bg-ink rounded-md px-3 py-2 space-y-1">
          <p className={`font-mono text-xs ${stale ? "text-warn" : "text-ok"}`}>
            Grand livre à jour au {day(summary.lastEntryAt)}
            {age != null && ` · il y a ${age} jour${age > 1 ? "s" : ""}`}
          </p>
          <p className="font-mono text-[11px] text-muted">
            {summary.rows} mouvement(s) · importé le {day(summary.importedAt)}
          </p>
          <p className="font-mono text-[11px] text-muted">
            Sorties {eur(summary.totals.out)} · Entrées {eur(summary.totals.in)} ·{" "}
            <span className={summary.totals.net >= 0 ? "text-ok" : "text-warn"}>
              net {eur(summary.totals.net)}
            </span>
            {summary.totals.fees > 0 && ` · dont ${eur(summary.totals.fees)} de frais`}
          </p>
          {summary.byYear.length > 0 && (
            <div className="pt-1 border-t border-line/50">
              <p className="font-mono text-[10px] text-muted uppercase tracking-wide mb-0.5">
                Réalisé par année civile (cumulé)
              </p>
              <ul className="space-y-0.5">
                {summary.byYear.map((y) => (
                  <li key={y.year} className="font-mono text-[11px] flex items-center justify-between gap-2">
                    <span className="text-muted">{y.year}</span>
                    <span className={y.net >= 0 ? "text-ok" : "text-warn"}>
                      {y.net >= 0 ? "+" : ""}
                      {eur(y.net)}
                    </span>
                    <span className={`ml-auto ${y.cumulativeNet >= 0 ? "text-ok" : "text-warn"}`}>
                      cumul {y.cumulativeNet >= 0 ? "+" : ""}
                      {eur(y.cumulativeNet)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.creditCards > 0 && (
            <p className="font-mono text-[11px] text-limited">
              {summary.creditCards} carte(s) réglée(s) en partie avec des crédits, pour{" "}
              {eur(summary.creditTotal)} — invisible dans le cash.
            </p>
          )}
          {stale && (
            <p className="font-mono text-[11px] text-warn">
              Réexporte depuis Sorare pour que le ROI colle à ton portefeuille actuel.
            </p>
          )}
        </div>
      ) : (
        <p className="font-mono text-xs text-muted">
          Aucun mouvement importé. Sans lui, l&apos;app connaît le prix d&apos;une carte mais pas la part
          réellement payée en cash.
        </p>
      )}

      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
        className="block w-full text-xs file:mr-3 file:py-2 file:px-3 file:rounded-md file:border file:border-line file:bg-ink2 file:text-fg file:text-xs file:font-bold"
      />
      <p className="font-mono text-xs text-muted">
        Sorare → Paramètres → Historique de compte → exporter en CSV. Réimporter le même fichier ne crée
        aucun doublon : seules les nouvelles lignes sont ajoutées. L&apos;API Sorare expose bien ce grand
        livre, mais sans référence de carte — c&apos;est ce fichier qui permet d&apos;attribuer un
        mouvement à une carte.
      </p>

      {busy && <p className="font-mono text-xs text-muted">Lecture du fichier…</p>}
      {notice && <p className="font-mono text-xs text-ok">{notice}</p>}
      {error && <p className="font-mono text-xs text-warn">{error}</p>}
    </div>
  );
}
