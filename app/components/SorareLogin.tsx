"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

type Status = {
  signedIn: boolean;
  expiresAt: string | null;
  kind: "oauth" | "jwt" | null;
  nickname: string | null;
  /** False on OAuth: its scope excludes future line-ups and rewards. */
  canReadLineups: boolean;
  oauthConfigured: boolean;
};

/** What the OAuth routes redirect back with, in the manager's language. */
const OAUTH_OUTCOME: Record<string, { text: string; tone: "ok" | "warn" }> = {
  connecte: { text: "Sorare Connect actif.", tone: "ok" },
  refuse: { text: "Connexion refusée sur Sorare.", tone: "warn" },
  invalide: { text: "Retour de connexion invalide ou expiré — relance la connexion.", tone: "warn" },
  echec: { text: "Sorare a refusé l'échange du code. Vérifie l'URL de callback de ton application.", tone: "warn" },
  non_configure: {
    text:
      "Sorare Connect n'est pas configuré : crée une application sur sorare.com/settings/developer, " +
      "puis renseigne SORARE_OAUTH_CLIENT_ID et SORARE_OAUTH_CLIENT_SECRET dans Vercel et redéploie.",
    tone: "warn",
  },
};

/**
 * In-app Sorare sign-in. Replaces the old flow of pasting a 6-digit code into
 * a Vercel env var and redeploying before it expired — the code is typed here
 * and used immediately.
 *
 * The password is posted once to derive the sign-in hash server-side and is
 * never stored; only the resulting token is kept (~30 days).
 */
export default function SorareLogin({
  status,
  onSignedIn,
}: {
  status: Status | null;
  onSignedIn: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthOutcome, setOauthOutcome] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = challenge ? { challenge, otp } : { email, password };
      const res = await apiFetch<{ status: string; challenge?: string }>("/api/sorare/signin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === "otp_required" && res.challenge) {
        setChallenge(res.challenge);
        setPassword(""); // no longer needed — don't keep it in memory
        return;
      }
      setOpen(false);
      setChallenge(null);
      setEmail("");
      setPassword("");
      setOtp("");
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la connexion");
    } finally {
      setBusy(false);
    }
  }

  /**
   * The OAuth routes hand their result back as `?sorare=…`. Nothing read it,
   * so even a successful connection said nothing at all. Cleared from the URL
   * once shown, otherwise a refresh would keep replaying an old outcome.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("sorare");
    if (!outcome) return;

    setOauthOutcome(OAUTH_OUTCOME[outcome] ?? null);
    params.delete("sorare");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));

    if (outcome === "connecte") onSignedIn();
    // onSignedIn is stable enough here; re-running on it would re-read a URL
    // that has already been cleaned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/sorare/oauth/disconnect", { method: "POST" });
      onSignedIn(); // re-reads status
    } catch (err) {
      setError(err instanceof Error ? err.message : "Déconnexion impossible");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="p-3 rounded-lg bg-ink2 border border-line space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold">Compte Sorare</p>
            <p className="text-xs text-muted truncate">
              {status?.signedIn
                ? `${status.kind === "oauth" ? "Connecté via Sorare Connect" : "Connecté par mot de passe"}${
                    status.nickname ? ` — ${status.nickname}` : ""
                  }`
                : "Non connecté — l'import CSV suffit pour la galerie"}
            </p>
          </div>
          {status?.signedIn && (
            <button
              onClick={disconnect}
              disabled={busy}
              className="shrink-0 text-xs text-warn border border-warn rounded-md px-3 py-1.5 disabled:opacity-50"
            >
              Déconnecter
            </button>
          )}
        </div>

        {/* Sorare's OAuth scope excludes future line-ups and rewards, so
            Connect alone cannot power the Compo board or the season report.
            Saying so up front beats letting those screens fail later. */}
        {status?.signedIn && status.kind === "oauth" && (
          <p className="text-[11px] font-mono text-limited bg-limited/10 border border-limited/40 rounded-md px-2.5 py-2">
            Sorare Connect ne donne pas accès aux compos ni aux gains — c&apos;est une limite de leur API, pas
            de l&apos;app. Pour l&apos;onglet Compo et le bilan de saison, connecte-toi aussi par mot de passe.
          </p>
        )}

        {oauthOutcome && (
          <p
            className={`text-[11px] font-mono rounded-md px-2.5 py-2 border ${
              oauthOutcome.tone === "ok"
                ? "text-ok bg-ok/10 border-ok/40"
                : "text-warn bg-warn/10 border-warn/40"
            }`}
          >
            {oauthOutcome.text}
          </p>
        )}

        <div className="flex gap-2">
          {/* Offering a button that can only dead-end is worse than not
              offering it — the status says whether Connect is set up. */}
          {status?.oauthConfigured === false ? (
            <span
              className="flex-1 text-center text-xs border border-line rounded-md px-3 py-2 text-muted"
              title="Renseigne SORARE_OAUTH_CLIENT_ID et SORARE_OAUTH_CLIENT_SECRET pour l'activer"
            >
              Connect non configuré
            </span>
          ) : (
            <a
              href="/api/sorare/oauth/start"
              className="flex-1 text-center text-xs bg-flood text-ink font-bold rounded-md px-3 py-2"
            >
              Sorare Connect
            </a>
          )}
          <button
            onClick={() => setOpen(true)}
            className="flex-1 text-xs border border-line rounded-md px-3 py-2"
          >
            Mot de passe
          </button>
        </div>
        <p className="text-[10px] font-mono text-muted">
          {status?.oauthConfigured === false
            ? "Sorare Connect s'active en créant une application sur sorare.com/settings/developer (callback : /api/sorare/oauth/callback), puis en renseignant les deux variables dans Vercel."
            : "Connect : galerie, ventes, solde — sans mot de passe ni code 2FA. Mot de passe : ajoute les compos, les divisions et les gains."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="p-3 rounded-lg bg-ink2 border border-line space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">{challenge ? "Code de validation" : "Connexion Sorare"}</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Annuler" className="text-muted text-xs">
          ✕
        </button>
      </div>

      {challenge ? (
        <>
          <p className="text-xs text-muted">
            Sorare demande ton code à 6 chiffres (Google Authenticator, ou celui reçu par email).
          </p>
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            autoFocus
            aria-label="Code à 6 chiffres"
            className="w-full bg-ink border border-line rounded-md px-3 py-2 font-mono text-lg tracking-[0.3em] text-center"
          />
        </>
      ) : (
        <>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="username"
            placeholder="Email Sorare"
            aria-label="Email Sorare"
            className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            placeholder="Mot de passe"
            aria-label="Mot de passe Sorare"
            className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-muted">
            Ton mot de passe sert uniquement à cette connexion et n&apos;est jamais enregistré.
          </p>
        </>
      )}

      {error && <p className="text-xs text-warn">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full bg-flood text-ink font-bold py-2.5 rounded-md text-sm disabled:opacity-50"
      >
        {busy ? "…" : challenge ? "Valider le code" : "Se connecter"}
      </button>
    </form>
  );
}
