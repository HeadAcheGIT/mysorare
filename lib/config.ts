export const config = {
  sorareEmail: process.env.SORARE_EMAIL ?? "",
  sorarePassword: process.env.SORARE_PASSWORD ?? "",
  sorareAud: process.env.SORARE_AUD || "sorare-cockpit",
  sorareApiKey: process.env.SORARE_API_KEY ?? "",
  sorareOtp: process.env.SORARE_OTP ?? "",

  graphqlUrl: "https://api.sorare.com/graphql",
  restUrl: "https://api.sorare.com",

  cronSecret: process.env.CRON_SECRET ?? "",

  apiFootballKey: process.env.APIFOOTBALL_KEY ?? "",
  apiFootballUrl: "https://v3.football.api-sports.io",

  formWindow: 15,
  recencyHalflife: 5,
  startMinutesThreshold: 60,
} as const;

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
