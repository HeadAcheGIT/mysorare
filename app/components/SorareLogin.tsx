"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

type Status = { signedIn: boolean; expiresAt: string | null };

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

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-ink2 border border-line">
        <div className="min-w-0">
          <p className="text-sm font-bold">Compte Sorare</p>
          <p className="text-xs text-muted truncate">
            {status?.signedIn
              ? `Connecté — token valide jusqu'au ${new Date(status.expiresAt!).toLocaleDateString("fr-FR")}`
              : "Non connecté — optionnel, l'import CSV suffit pour la galerie"}
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 text-xs border border-line rounded-md px-3 py-1.5"
        >
          {status?.signedIn ? "Reconnecter" : "Connexion"}
        </button>
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
