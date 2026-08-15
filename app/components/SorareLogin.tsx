"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

type Status = {
  signedIn: boolean;
  expiresAt: string | null;
  kind: "oauth" | "jwt" | null;
  nickname: string | null;
  /** False on OAuth: its scope excludes future line-ups and rewards. */
  canReadLineups: boolean;
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

        <div className="flex gap-2">
          <a
            href="/api/sorare/oauth/start"
            className="flex-1 text-center text-xs bg-flood text-ink font-bold rounded-md px-3 py-2"
          >
            Sorare Connect
          </a>
          <button
            onClick={() => setOpen(true)}
            className="flex-1 text-xs border border-line rounded-md px-3 py-2"
          >
            Mot de passe
          </button>
        </div>
        <p className="text-[10px] font-mono text-muted">
          Connect : galerie, ventes, solde — sans mot de passe ni code 2FA. Mot de passe : ajoute les compos,
          les divisions et les gains.
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
