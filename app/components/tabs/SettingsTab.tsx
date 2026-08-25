"use client";

import CsvImport from "../CsvImport";
import AccountingImport from "../AccountingImport";
import SyncAll from "../SyncAll";
import SorareLogin, { type TokenStatus } from "../SorareLogin";

export type SyncLogRow = {
  job: string;
  status: string;
  detail: string | null;
  ranAt: string;
};

interface SettingsTabProps {
  fixture: string | null;
  tokenStatus: TokenStatus | null;
  logs: SyncLogRow[];
  notice: string;
  checkingLineups: boolean;
  syncingFriendlies: boolean;
  refreshAll: () => Promise<void>;
  loadSales: () => Promise<void>;
  loadLogs: () => Promise<void>;
  loadTokenStatus: () => Promise<void>;
  runLineupCheck: () => Promise<void>;
  syncFriendlies: () => Promise<void>;
  setNotice: (msg: string) => void;
  onError: (msg: string) => void;
}

export default function SettingsTab({
  fixture,
  tokenStatus,
  logs,
  notice,
  checkingLineups,
  syncingFriendlies,
  refreshAll,
  loadSales,
  loadLogs,
  loadTokenStatus,
  runLineupCheck,
  syncFriendlies,
  setNotice,
  onError,
}: SettingsTabProps) {
  return (
    <section aria-label="Données" className="space-y-3">
      <CsvImport onDone={refreshAll} />

      <AccountingImport onImported={loadSales} />

      <SyncAll
        fixture={fixture}
        signedIn={Boolean(tokenStatus?.signedIn)}
        onDone={async (summary) => {
          await refreshAll();
          await loadLogs();
          setNotice(summary);
        }}
        onError={(m) => onError(m)}
      />

      <div className="pt-2 border-t border-line space-y-3">
        <h2 className="font-display uppercase text-sm tracking-wide text-muted">Autres sources</h2>

        <button
          onClick={runLineupCheck}
          disabled={checkingLineups}
          className="w-full border border-line font-bold py-3 rounded-md text-sm disabled:opacity-50"
        >
          {checkingLineups ? "Vérification…" : "Vérifier les compos officielles"}
        </button>
        <p className="font-mono text-xs text-muted">
          Utile seulement ~90 min avant le coup d&apos;envoi. Nécessite APIFOOTBALL_KEY.
        </p>

        <button
          onClick={syncFriendlies}
          disabled={syncingFriendlies}
          className="w-full border border-line font-bold py-3 rounded-md text-sm disabled:opacity-50"
        >
          {syncingFriendlies ? "Récupération…" : "Récupérer les matchs de préparation"}
        </button>
        <p className="font-mono text-xs text-muted">
          Minutes, buts et passes de tes joueurs en amicaux de club — l&apos;API Sorare ne les couvre
          pas, ceux-ci viennent d&apos;API-Football (nécessite APIFOOTBALL_KEY, ~1 requête par club puis
          1 par match sur les 100/jour gratuites). À lancer une fois par semaine pendant la préparation.
        </p>
      </div>

      {notice && <p className="font-mono text-xs text-ok">{notice}</p>}

      <SorareLogin status={tokenStatus} onSignedIn={loadTokenStatus} />

      <div>
        <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">Journal</h2>
        <ul className="flex flex-col gap-2 font-mono text-xs">
          {logs.map((l, i) => (
            <li key={i} className="border-b border-line pb-2 flex justify-between gap-2">
              <span className={l.status === "error" ? "text-warn" : "text-ok"}>
                {l.status} · {l.job}
                {l.detail ? ` · ${l.detail}` : ""}
              </span>
              <span className="text-muted shrink-0">{new Date(l.ranAt).toLocaleString("fr-FR")}</span>
            </li>
          ))}
          {logs.length === 0 && <li className="text-muted">Aucune opération enregistrée.</li>}
        </ul>
      </div>
    </section>
  );
}
