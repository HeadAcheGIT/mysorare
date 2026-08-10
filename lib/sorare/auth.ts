import bcrypt from "bcryptjs";
import { assertConfigured, config } from "../config";
import { prisma } from "../prisma";

export class SorareAuthError extends Error {}

const SIGN_IN = (aud: string) => `
mutation SignInMutation($input: signInInput!) {
  signIn(input: $input) {
    currentUser { slug nickname }
    jwtToken(aud: "${aud}") { token expiredAt }
    otpSessionChallenge
    tcuToken
    errors { message }
  }
}`;

async function post(payload: unknown) {
  const r = await fetch(config.graphqlUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.sorareApiKey ? { APIKEY: config.sorareApiKey } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Sorare HTTP ${r.status}`);
  return r.json();
}

async function hashedPassword(email: string, password: string): Promise<string> {
  // Sorare requires the password hashed client-side with a per-account salt
  // served over REST — never sent in the clear.
  const r = await fetch(`${config.restUrl}/api/v1/users/${encodeURIComponent(email)}`);
  if (!r.ok) throw new SorareAuthError(`Could not fetch salt for ${email} (HTTP ${r.status})`);
  const { salt } = (await r.json()) as { salt: string };
  return bcrypt.hashSync(password, salt);
}

async function readCache(): Promise<string | null> {
  const row = await prisma.tokenCache.findUnique({ where: { id: 1 } });
  if (!row) return null;
  // renew a day early rather than getting a mid-request 401
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (row.expiresAt.getTime() - oneDayMs > Date.now()) return row.token;
  return null;
}

async function writeCache(token: string, expiredAt: number) {
  await prisma.tokenCache.upsert({
    where: { id: 1 },
    create: { id: 1, token, expiresAt: new Date(expiredAt * 1000) },
    update: { token, expiresAt: new Date(expiredAt * 1000) },
  });
}

function collectErrors(signIn: any): string | null {
  return signIn?.errors?.length
    ? signIn.errors.map((e: { message: string }) => e.message).join("; ")
    : null;
}

/** Normalises the two shapes Sorare returns for expiry, then caches the token. */
async function storeToken(jwt: { token: string; expiredAt: string | number }): Promise<string> {
  const expiredAt =
    typeof jwt.expiredAt === "string" ? Math.floor(Date.parse(jwt.expiredAt) / 1000) : jwt.expiredAt;
  await writeCache(jwt.token, expiredAt);
  return jwt.token;
}

export type SignInOutcome =
  | { status: "signed_in"; nickname: string | null }
  | { status: "otp_required"; challenge: string };

/**
 * Step one of the in-app sign-in. The password is hashed, sent, and dropped —
 * never written to the database or to an env var. When the account has 2FA on
 * (or Sorare doesn't recognise the calling IP, which on serverless is most of
 * the time), this returns a challenge to be completed by `completeOtp`.
 */
export async function signInWithPassword(email: string, password: string): Promise<SignInOutcome> {
  const query = SIGN_IN(config.sorareAud);
  const data: any = await post({
    operationName: "SignInMutation",
    query,
    variables: { input: { email, password: await hashedPassword(email, password) } },
  });
  const signIn = data?.data?.signIn ?? {};

  const errors = collectErrors(signIn);
  if (errors) throw new SorareAuthError(errors);

  if (signIn.otpSessionChallenge) {
    return { status: "otp_required", challenge: signIn.otpSessionChallenge };
  }
  if (!signIn.jwtToken) {
    throw new SorareAuthError(
      "Connexion sans token. Vérifie tes identifiants, ou accepte les conditions mises à jour sur sorare.com."
    );
  }
  await storeToken(signIn.jwtToken);
  return { status: "signed_in", nickname: signIn.currentUser?.nickname ?? null };
}

/** Step two: exchanges the challenge plus the 6-digit code for a token. */
export async function completeOtp(challenge: string, otp: string): Promise<SignInOutcome> {
  const data: any = await post({
    operationName: "SignInMutation",
    query: SIGN_IN(config.sorareAud),
    variables: { input: { otpSessionChallenge: challenge, otpAttempt: otp } },
  });
  const signIn = data?.data?.signIn ?? {};

  const errors = collectErrors(signIn);
  if (errors) throw new SorareAuthError(errors);
  if (!signIn.jwtToken) throw new SorareAuthError("Code incorrect ou expiré — redemande un code.");

  await storeToken(signIn.jwtToken);
  return { status: "signed_in", nickname: signIn.currentUser?.nickname ?? null };
}

/** Whether a usable token is cached, and until when — drives the UI's status. */
export async function tokenStatus(): Promise<{ signedIn: boolean; expiresAt: Date | null }> {
  const row = await prisma.tokenCache.findUnique({ where: { id: 1 } });
  if (!row) return { signedIn: false, expiresAt: null };
  return { signedIn: row.expiresAt.getTime() > Date.now(), expiresAt: row.expiresAt };
}

export async function getToken(force = false): Promise<string> {
  if (!force) {
    const cached = await readCache();
    if (cached) return cached;
  }

  // Falls back to env-var credentials only when nothing has been signed in
  // through the app. The in-app flow (signInWithPassword/completeOtp) is the
  // supported path — it handles 2FA without an env var edit and a redeploy.
  if (!config.sorareEmail || !config.sorarePassword) {
    throw new SorareAuthError(
      "Non connecté à Sorare. Ouvre l'onglet Synchro et connecte-toi avec ton email, ton mot de passe et ton code à 6 chiffres."
    );
  }

  const query = SIGN_IN(config.sorareAud);
  let data: any = await post({
    operationName: "SignInMutation",
    query,
    variables: {
      input: {
        email: config.sorareEmail,
        password: await hashedPassword(config.sorareEmail, config.sorarePassword),
      },
    },
  });
  let signIn: any = data?.data?.signIn ?? {};

  if (signIn.errors?.length) {
    throw new SorareAuthError(signIn.errors.map((e: { message: string }) => e.message).join("; "));
  }

  if (signIn.otpSessionChallenge) {
    if (!config.sorareOtp) {
      throw new SorareAuthError(
        "2FA required. Set SORARE_OTP to the current one-time code in your Vercel env vars, " +
          "redeploy, then clear it once signed in. A token minted from a new IP always triggers 2FA."
      );
    }
    data = await post({
      operationName: "SignInMutation",
      query,
      variables: {
        input: {
          otpSessionChallenge: signIn.otpSessionChallenge,
          otpAttempt: config.sorareOtp,
        },
      },
    });
    signIn = data?.data?.signIn ?? {};
    if (signIn.errors?.length) {
      throw new SorareAuthError(signIn.errors.map((e: { message: string }) => e.message).join("; "));
    }
  }

  const jwt = signIn.jwtToken;
  if (!jwt) {
    throw new SorareAuthError(
      "Sign-in returned no token. Check credentials, or accept updated Terms on sorare.com."
    );
  }

  const expiredAt =
    typeof jwt.expiredAt === "string" ? Math.floor(Date.parse(jwt.expiredAt) / 1000) : jwt.expiredAt;
  await writeCache(jwt.token, expiredAt);
  return jwt.token as string;
}
