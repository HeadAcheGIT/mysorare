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

export async function getToken(force = false): Promise<string> {
  if (!force) {
    const cached = await readCache();
    if (cached) return cached;
  }

  assertConfigured(["sorareEmail", "sorarePassword"]);
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
