import { config } from "../config";
import { prisma } from "../prisma";

/**
 * "Login with Sorare" — Sorare's OAuth 2.0 flow.
 *
 * Why it exists alongside the password sign-in rather than replacing it: its
 * single scope is documented as excluding "future lineups and rewards", which
 * is exactly what the Compo board and the season report read. So Connect is
 * the friendly default for the gallery and sales, and the JWT path stays for
 * the features OAuth cannot reach. lib/sorare/auth.ts picks whichever is
 * stored; the UI says which unlocks what.
 *
 * Endpoints and parameters follow github.com/sorare/api's README.
 */

const AUTHORIZE_URL = "https://sorare.com/oauth/authorize";
const TOKEN_URL = "https://api.sorare.com/oauth/token";
const REVOKE_URL = "https://api.sorare.com/oauth/revoke";

export class SorareOAuthError extends Error {}

export function isOAuthConfigured(): boolean {
  return Boolean(config.oauthClientId && config.oauthClientSecret);
}

/**
 * The redirect URI must match what was registered at
 * sorare.com/settings/developer *exactly*, including scheme and host, so it's
 * derived from the incoming request rather than guessed from an env var that
 * would drift between preview and production deploys.
 */
export function redirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/sorare/oauth/callback`;
}

export function authorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: config.oauthClientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    // Sorare exposes a single scope; sending it empty is what the docs show.
    scope: "",
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await r.json().catch(() => ({}))) as TokenResponse;
  if (!r.ok || json.error) {
    throw new SorareOAuthError(json.error_description ?? json.error ?? `Sorare OAuth HTTP ${r.status}`);
  }
  if (!json.access_token) throw new SorareOAuthError("Réponse OAuth sans access_token.");
  return json;
}

async function store(tokens: TokenResponse, nickname?: string | null) {
  // Access tokens last 2 hours; the refresh token is what keeps the connection
  // alive, so losing it would silently downgrade Connect to a two-hour session.
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 7200) * 1000);
  const row = {
    token: tokens.access_token as string,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt,
    kind: "oauth",
    ...(nickname !== undefined ? { nickname } : {}),
  };
  await prisma.tokenCache.upsert({ where: { id: 1 }, create: { id: 1, ...row }, update: row });
}

/** Exchanges the authorization code for tokens and stores them. */
export async function exchangeCode(code: string, origin: string): Promise<void> {
  const tokens = await postToken({
    client_id: config.oauthClientId,
    client_secret: config.oauthClientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(origin),
  });
  await store(tokens, null);
}

/**
 * Swaps the refresh token for a fresh access token. Returns null when there's
 * nothing to refresh, so the caller can fall through to asking the user to
 * reconnect instead of retrying forever.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const row = await prisma.tokenCache.findUnique({ where: { id: 1 } });
  if (!row || row.kind !== "oauth" || !row.refreshToken) return null;

  const tokens = await postToken({
    client_id: config.oauthClientId,
    client_secret: config.oauthClientSecret,
    refresh_token: row.refreshToken,
    grant_type: "refresh_token",
  });
  await store(tokens);
  return tokens.access_token as string;
}

/** Revokes the stored token with Sorare, then forgets it locally. */
export async function disconnect(): Promise<void> {
  const row = await prisma.tokenCache.findUnique({ where: { id: 1 } });
  if (row?.kind === "oauth" && isOAuthConfigured()) {
    // Best effort: a revoke that fails must still clear the local session,
    // otherwise the UI would keep claiming to be connected.
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.oauthClientId,
        client_secret: config.oauthClientSecret,
        token: row.token,
      }).toString(),
    }).catch(() => null);
  }
  await prisma.tokenCache.deleteMany({ where: { id: 1 } });
}
