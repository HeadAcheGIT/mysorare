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
 * one), and PLAYERS_BY_SLUG costs ~39 per player. Measured against the live
 * API: 15 players scores 586 and 13 scores 508 — both rejected — while 12
 * passes. That made unauthenticated enrichment fail on *every* batch, which
 * is the app's own documented default path, and the failure repeated forever
 * because a page that never succeeds is always the stalest one and gets
 * picked again on the next call.
 *
 * So the page size depends on whether a key is configured: 10 without one
 * (~391, leaving room for a field or two to be added here before it breaks
 * again), the previously measured 15 with one, where the cap is 60× higher
 * and irrelevant. Any field added to PLAYERS_BY_SLUG must be re-measured
 * against the unauthenticated cap — post the document to the API and read
 * the complexity back off the error.
 */
export const PLAYERS_PER_QUERY = config.sorareApiKey ? 15 : 10;

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
 * so the gap is only read when both clubs play the same one — hence
 * `domesticLeague`, which a cup tie makes differ — and the adjustment it
 * drives is deliberately bounded on top of that; see fixtureDifficultyFactor.
 *
 * `name`/`pictureUrl` are here because these are the only rows that ever name
 * an *opponent*: enrichment only ever sees the clubs of players you own.
 */
export const FIXTURE_GAMES_PUBLIC = `
query FixtureGames($slug: String!) {
  so5 {
    so5Fixture(slug: $slug) {
      games {
        id
        date
        homeTeam { ... on Club { slug name pictureUrl domesticLeagueRanking domesticLeague { slug displayName } } }
        awayTeam { ... on Club { slug name pictureUrl domesticLeagueRanking domesticLeague { slug displayName } } }
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
 *
 * Costs far more per item than PLAYERS_BY_SLUG — an ownership chain is a
 * nested connection — hence its own page size below rather than sharing that
 * one: measured against the live API at ~72 per card (10 cards score 721,
 * 7 score 505, 6 pass), where a player costs ~39.
 */
/**
 * Cards per CARD_OWNERSHIP_PUBLIC call. Five without an API key (~361 against
 * the 500 cap, room for the chain to grow), fifteen with one — reusing
 * PLAYERS_PER_QUERY here failed every batch, so "prix d'achat réels" never
 * priced a single card on the app's own default, keyless path.
 */
export const CARDS_PER_OWNERSHIP_QUERY = config.sorareApiKey ? 15 : 5;

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

/**
 * Open auctions, newest activity first.
 *
 * Sorare offers no per-player filter here, so watching specific players means
 * scanning this feed and matching slugs locally — bounded by the caller rather
 * than walked to the end, since it covers every football auction of the last
 * ten days.
 *
 * `bestBid.amounts` carries EUR once someone has bid; before that only the wei
 * `currentPrice` exists and has to be converted.
 */
export const LIVE_AUCTIONS_PUBLIC = `
query LiveAuctions($first: Int!, $after: String) {
  tokens {
    liveAuctions(first: $first, after: $after, sport: FOOTBALL) {
      pageInfo { hasNextPage endCursor }
      nodes {
        open
        endDate
        bidsCount
        currency
        currentPrice
        bestBid { amounts { eurCents } }
        anyCards {
          slug
          rarityTyped
          seasonYear
          inSeasonEligible
          serialNumber
          anyPlayer { slug displayName }
        }
      }
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
