import { config } from "../config";

/**
 * Sorare's GraphQL API serves all *public* football data without any login:
 * player photos, clubs, injuries, recent scores, even Sorare's own projected
 * score. Only `currentUser` (your gallery) needs a token.
 *
 * That matters a lot here: authenticated sign-in re-triggers 2FA whenever the
 * caller's IP changes, which on serverless is constantly — so anything that
 * can be read without a token should be, and the gallery itself comes from
 * the SorareScore CSV import instead (see lib/services/csvImport.ts).
 *
 * Rate limits: 20 calls/min unauthenticated, 600/min with an API key. Batching
 * by slug list keeps a 400-card gallery well inside the free budget.
 */

const MIN_DELAY_MS = config.sorareApiKey ? 120 : 3200; // 20/min unauthenticated
let lastCall = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pace() {
  const wait = MIN_DELAY_MS - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}

export async function publicGraphql<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
  attempt = 0
): Promise<T> {
  await pace();

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.sorareApiKey) headers.APIKEY = config.sorareApiKey;

  const r = await fetch(config.graphqlUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (r.status === 429 && attempt < 3) {
    const retryAfter = Number(r.headers.get("retry-after") ?? "10");
    await sleep(retryAfter * 1000);
    return publicGraphql<T>(query, variables, attempt + 1);
  }
  if (!r.ok) throw new Error(`Sorare HTTP ${r.status}`);

  const body = await r.json();
  if (body.errors?.length) {
    throw new Error(`GraphQL: ${body.errors.map((e: { message: string }) => e.message).join("; ")}`);
  }
  return body.data as T;
}

/**
 * Batch player lookup. `anyPositions` (not `position`) and `players` at the
 * root (not under `football`) are current as of the 2026 schema — if these
 * error, re-download the schema and grep for the new names:
 *   curl -o schema.graphql https://api.sorare.com/graphql/schema
 *
 * Sorare also caps *query complexity* at 500 without an API key (30000 with
 * one). Measured: 25 players × 15 scores scores 501 and is rejected, so the
 * score window is 10 and PLAYERS_PER_QUERY stays at 15 for headroom.
 */
export const PLAYERS_PER_QUERY = 15;

export const PLAYERS_BY_SLUG = `
query PlayersBySlug($slugs: [String!]!) {
  players(slugs: $slugs) {
    slug
    displayName
    age
    shirtNumber
    anyPositions
    avatarPictureUrl
    squaredPictureUrl
    country { code }
    activeClub { ... on Club { slug name pictureUrl country { code } } }
    activeInjuries { status expectedEndDate }
    activeSuspensions { reason endDate }
    nextClassicFixtureProjectedScore
    rawPlayerGameScores(last: 10)
  }
}`;
