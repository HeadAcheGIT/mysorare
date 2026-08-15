export const config = {
  sorareEmail: process.env.SORARE_EMAIL ?? "",
  sorarePassword: process.env.SORARE_PASSWORD ?? "",
  sorareAud: process.env.SORARE_AUD || "sorare-cockpit",
  sorareApiKey: process.env.SORARE_API_KEY ?? "",
  sorareOtp: process.env.SORARE_OTP ?? "",

  // "Login with Sorare". Created self-service at sorare.com/settings/developer.
  // Optional: without them the app falls back to the email/password sign-in.
  oauthClientId: process.env.SORARE_OAUTH_CLIENT_ID ?? "",
  oauthClientSecret: process.env.SORARE_OAUTH_CLIENT_SECRET ?? "",

  graphqlUrl: "https://api.sorare.com/graphql",
  restUrl: "https://api.sorare.com",

  cronSecret: process.env.CRON_SECRET ?? "",

  apiFootballKey: process.env.APIFOOTBALL_KEY ?? "",
  apiFootballUrl: "https://v3.football.api-sports.io",

  formWindow: 15,
  recencyHalflife: 5,
  startMinutesThreshold: 60,
} as const;

/**
 * Env vars are only actually needed once a service touches Sorare/API-Football,
 * not at module load (routes that don't need them must still work). Call this
 * right before the first request that depends on the given keys so a missing
 * var fails with a clear message instead of a cryptic downstream error.
 */
export function assertConfigured(keys: (keyof typeof config)[]) {
  const missing = keys.filter((k) => !config[k]);
  if (missing.length) {
    throw new Error(
      `Variable(s) d'environnement manquante(s) : ${missing.join(", ")}. ` +
        `Vérifie la configuration dans les paramètres du projet Vercel, puis redéploie.`
    );
  }
}

// Position baselines, used only when a player has almost no history.
export const POSITION_BASELINE: Record<
  string,
  { start: number; bench: number; pStart: number }
> = {
  Goalkeeper: { start: 45, bench: 12, pStart: 0.55 },
  Defender: { start: 48, bench: 14, pStart: 0.5 },
  Midfielder: { start: 50, bench: 16, pStart: 0.5 },
  Forward: { start: 52, bench: 18, pStart: 0.45 },
};

export const PRIOR_WEIGHT = 3; // virtual games behind the position baseline
