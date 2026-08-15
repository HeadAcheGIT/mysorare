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

// players(slugs) returns AnyPlayerInterface, which has no birthDate field —
// only the concrete Player type does, and this connection can't use an
// inline fragment to reach it. Verified against the live API: a field name
// that "sounds right" from reading the schema isn't the same as confirming
// it resolves on the type actually returned here. The interface does expose
// birthDay (date-only, no time), aliased back to the name every downstream
// consumer already expects.
//
// nextClassicFixturePlayingStatusOdds (Sorare's own starter odds, from its
// data partner) is the same story and cost an outage once already: it sits on
// the concrete Player, NOT on AnyPlayerInterface, so asking for it directly
// 422s the whole batch and silently kills every enrichment — exactly the
// failure mode of the birthDate bug. Unlike birthDate it *is* reachable via
// an inline fragment on Player, verified against the live API. Any new field
// added here gets the same treatment: post the document to the API and check
// it resolves before trusting it.
export const PLAYERS_BY_SLUG = `
query PlayersBySlug($slugs: [String!]!) {
  players(slugs: $slugs) {
    slug
    displayName
    age
    birthDate: birthDay
    shirtNumber
    anyPositions
    avatarPictureUrl
    squaredPictureUrl
    country { code }
    activeClub { ... on Club { slug name pictureUrl country { code } domesticLeagueRanking domesticLeague { slug displayName } } }
    activeInjuries { status expectedEndDate }
    activeSuspensions { reason endDate }
    nextClassicFixtureProjectedScore
    ... on Player {
      nextClassicFixturePlayingStatusOdds {
        starterOddsBasisPoints
        reliability
        providerIconUrl
        providerRedirectUrl
      }
    }
    lastFiveSo5Appearances
    lastFifteenSo5Appearances
    seasonAppearances
    avgL5: averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE)
    avgL15: averageScore(type: LAST_FIFTEEN_SO5_AVERAGE_SCORE)
    avgL10Played: averageScore(type: LAST_TEN_PLAYED_SO5_AVERAGE_SCORE)
    rawPlayerGameScores(last: 10)
  }
}`;

/**
 * Upcoming game weeks with their lock times. Cheap enough to run
 * unauthenticated, unlike the per-game schedule (`competitionGames` scores
 * ~940 complexity against the 500 cap, so fixtures-with-games needs an API key).
 */
/**
 * Every game of one game week with both clubs' league positions — the whole
 * fixture-difficulty signal in a single call, where asking per player would be
 * one paced request each.
 *
 * League position is a coarse proxy for strength and it isn't comparable
 * across competitions (second in Norway isn't second in the Premier League),
 * so only the *gap between the two clubs in a given match* is used, and the
 * adjustment it drives is deliberately bounded — see fixtureDifficultyFactor.
 */
export const FIXTURE_GAMES_PUBLIC = `
query FixtureGames($slug: String!) {
  so5 {
    so5Fixture(slug: $slug) {
      games {
        id
        date
        homeTeam { ... on Club { slug domesticLeagueRanking } }
        awayTeam { ... on Club { slug domesticLeagueRanking } }
      }
    }
  }
}`;

/**
 * How each card was acquired and for how much, from the blockchain ownership
 * record. Public and batchable, unlike the authenticated offer connections.
 *
 * This is the honest answer to "what did I pay": it covers auctions, instant
 * buys, offers, rewards and packs alike, where reading completed single-sale
 * offers only ever caught one of those. `settlementDelayReason` additionally
 * says when conversion credits settled the purchase.
 */
export const CARD_OWNERSHIP_PUBLIC = `
query CardOwnership($slugs: [String!]!) {
  anyCards(slugs: $slugs) {
    slug
    ownershipHistory {
      from
      transferType
      settlementDelayReason
      amounts { eurCents usdCents wei }
    }
  }
}`;

export const OPEN_FIXTURES_PUBLIC = `
query OpenFixtures {
  so5 {
    allSo5Fixtures(sport: FOOTBALL, eventType: CLASSIC, future: true, first: 4) {
      nodes { slug displayName shortDisplayName gameWeek startDate endDate cutOffDate }
    }
  }
}`;
