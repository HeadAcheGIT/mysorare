/**
 * All GraphQL documents live here. The Sorare schema moves between seasons —
 * before the first real sync, download it and check any field that errors:
 *
 *   curl -o schema.graphql https://api.sorare.com/graphql/schema
 *
 * The client surfaces `GraphQL error: Field 'x' doesn't exist on type 'Y'`
 * with the exact field name, so a drifted query is a one-line fix here.
 */

export const MY_CARDS = `
query MyCards($first: Int, $after: String) {
  currentUser {
    slug
    nickname
    cards(sport: FOOTBALL, first: $first, after: $after) {
      nodes {
        slug
        assetId
        rarityTyped
        serialNumber
        seasonYear
        inSeasonEligible
        power
        anyPlayer {
          slug
          displayName
          # AnyPlayerInterface exposes anyPositions, not position — asking for
          # the singular 422s the whole card sync.
          anyPositions
          age
          activeInjuries { status expectedEndDate }
          activeClub { ... on Club { slug name country { code } } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

/**
 * `so5` is a ROOT field (Query.so5: So5Root!), not a member of FootballRoot —
 * `football { so5 { … } }` fails outright with "Field 'so5' doesn't exist on
 * type 'FootballRoot'". Verified against the live API, same as every other
 * query in this file needs to be before it's trusted.
 */
export const OPEN_FIXTURES = `
query OpenFixtures {
  so5 {
    so5Fixtures(first: 3) {
      nodes { slug startDate endDate aasmState }
    }
  }
}`;

/**
 * What was actually fielded for one fixture — every lineup entered across
 * every division/leaderboard, so "what did I align" reflects the real Sorare
 * split rather than a single composite lineup. `so5Appearances(includeSubs:
 * true)` carries the bench too, since a benched card is still worth grading
 * against the probability that predicted it wouldn't start.
 */
export const MY_LINEUPS_FOR_FIXTURE = `
query MyLineupsForFixture($slug: String!) {
  so5 {
    so5Fixture(slug: $slug) {
      mySo5Lineups {
        id
        so5Leaderboard {
          slug
          displayName(short: true)
          division
          divisionIconUrl
        }
        so5Appearances(includeSubs: true) {
          captain
          position
          score(withBonus: true)
          anyCard { slug anyPlayer { slug } }
        }
      }
    }
  }
}`;

/**
 * The account's real competition structure for one game week: the league
 * tracks it can enter ("Champion Europe", "Contender", …), the manager teams
 * inside each with the division they currently sit in, and every division's
 * own verdict on whether a line-up can be entered.
 *
 * This replaces the hand-written COMPETITIONS list in lib/services/rules.ts as
 * the answer to "where can I actually play" — that list was four competitions
 * typed from memory and could never match a real account.
 *
 * Deliberately does NOT nest `mySo5Lineups` under `so5Leaderboards`: that
 * would be three levels of lists in one document, and MY_LINEUPS_FOR_FIXTURE
 * above already fetches them flat with their leaderboard attached. Keeping
 * them apart keeps this query inside Sorare's query-complexity cap.
 *
 * `canCompose` is Sorare's own eligibility verdict — `missingCards`,
 * `missingPositions` and `missingAnyRarities` are what the in-season advisor
 * reasons over, and `transferMarketFilters` is Sorare's own market filter for
 * the cards that would close the gap.
 */
/**
 * Split across four documents on purpose. Sorare caps *query complexity* at
 * 500 without an API key (30000 with one), and the natural single query for
 * this — tracks with their leaderboards, eligibility and rewards nested —
 * measures 3905. Each document below was measured against the live API and
 * lands under 500, so the divisions feature works on a plain signed-in
 * account instead of silently requiring SORARE_API_KEY.
 *
 * The split is by cost, not by concern: nested lists are what blow the
 * budget, so the leaderboard detail is fetched flat off the fixture
 * (`so5Leaderboards`, every leaderboard of the game week) and matched back to
 * tracks using the slug list from MY_TRACKS.
 */
export const MY_TRACKS = `
query MyTracks($slug: String!) {
  so5 {
    so5Fixture(slug: $slug) {
      slug
      gameWeek
      mySo5LeagueTracks {
        slug
        displayName
        seasonality
        seasonalityName
        maxManagerTeamsCount
        unlockedManagerTeamsCount
        so5LineupsCount
        canCompose { value reason missingCards notEnoughEligibleCards }
        totalRewards { prizePool prizePoolCurrency }
        so5Leaderboards { slug }
      }
    }
  }
}`;

/** Manager teams are costly enough to need their own document — see MY_TRACKS. */
export const MY_TRACK_TEAMS = `
query MyTrackTeams($slug: String!) {
  so5 {
    so5Fixture(slug: $slug) {
      mySo5LeagueTracks {
        slug
        iconUrl
        myManagerTeams { id name activeDivision activeDivisionIconUrl }
      }
    }
  }
}`;

/** Every division of the game week, with Sorare's own eligibility verdict. */
export const FIXTURE_DIVISIONS = `
query FixtureDivisions($slug: String!) {
  so5 {
    so5Fixture(slug: $slug) {
      so5Leaderboards {
        slug
        displayName(short: true)
        division
        divisionIconUrl
        rarityType
        seasonality
        cutOffDate
        mySo5LineupsCount
        canCompose {
          value
          reason
          missingCards
          notEnoughEligibleCards
          missingPositions
          missingAnyRarities
          transferMarketFilters
        }
      }
    }
  }
}`;

/** Per-position card counts and prize pools — split out to stay under the cap. */
export const DIVISION_ELIGIBILITY = `
query DivisionEligibility($slug: String!) {
  so5 {
    so5Fixture(slug: $slug) {
      so5Leaderboards {
        slug
        eligibleCardsCountByPosition { position seasonality totalCount usedCardsCount }
        totalRewards { prizePool prizePoolCurrency }
      }
    }
  }
}`;

/**
 * The cards from this gallery that can actually be fielded in ONE division —
 * Sorare's own compose bench, so eligibility is its answer rather than rules
 * re-implemented here.
 *
 * Per division on purpose: a game week exposes ~76 leaderboards, so this is
 * fetched only when a division is opened, never in bulk.
 *
 * `lockedForLeaderboard` is the "already committed" flag that makes a bench
 * honest — a card sitting in another line-up can't be picked again, and
 * proposing it would be advice you can't act on. `projectedScore` is Sorare's
 * projection *for this division*, which is not the same number as its generic
 * one.
 */
export const DIVISION_BENCH = `
query DivisionBench($lb: String!) {
  so5 {
    so5Leaderboard(slug: $lb) {
      slug
      myBench(first: 40) {
        nodes {
          id
          position
          positions
          rarity
          bonus
          projectedScore(so5LeaderboardSlug: $lb)
          lockedForLeaderboard(so5LeaderboardSlug: $lb)
          anyPlayer { slug displayName }
          ... on ComposeTeamBenchCard { anyCard { slug } }
        }
      }
    }
  }
}`;

/**
 * Sorare's own verdict on a proposed line-up. This is what removes the need to
 * re-implement composition rules: `feedbackRules` names each rule and whether
 * it passes, so a suggestion is either confirmed valid by Sorare or rejected
 * with its reason, instead of being trusted because our own model said so.
 */
export const PREVIEW_LINEUP = `
query PreviewLineup($lb: String!, $appearances: [So5AppearanceInput!]!) {
  so5 {
    so5Leaderboard(slug: $lb) {
      previewSo5Lineup(appearances: $appearances) {
        rewardMultiplier
        feedbackRules { ruleName state message }
      }
    }
  }
}`;

/**
 * Where each line-up finished for a game week and what it paid.
 *
 * The only record of real money in this app — every other number is a
 * projection. `so5Rewards` is empty until a fixture closes, which is expected:
 * a game week in progress has a ranking but no settled reward yet.
 */
export const MY_REWARDS_FOR_FIXTURE = `
query MyRewardsForFixture($slug: String!) {
  so5 {
    so5Fixture(slug: $slug) {
      slug
      gameWeek
      mySo5Rankings {
        id
        ranking
        score
        so5Leaderboard { slug displayName(short: true) division }
        so5Rewards {
          amount { eurCents }
          rewardCards { anyCard { slug } }
        }
      }
    }
  }
}`;

/** Card slugs already engaged in a live or upcoming line-up — powers the gallery's "en compo" flag. */
export const CARDS_IN_LINEUPS = `
query CardsInLineups {
  currentUser {
    blockchainCardsInLineups(sport: FOOTBALL)
  }
}`;

/**
 * The manager's own watchlists as kept on Sorare.
 *
 * Found by probing: the schema isn't introspectable, but Sorare's validator
 * suggests near-misses, and `watchlists` answered "Did you mean `myWatchlists`?".
 * Neither `myWatchlists` nor `playersPanel` accepts pagination arguments — both
 * are plain lists, not connections, so there is no cursor to follow.
 *
 * `playersPanel` returns `CommonPlayer`, the same wrapper the market search
 * already unwraps via `anyPlayer` (see lib/services/market.ts).
 *
 * The selection is deliberately minimal: with `domesticLeague` and `birthDay`
 * included this measured 502 against the unauthenticated cap of 500. Neither is
 * a loss — the watchlist endpoint joins league and birth date live from
 * Player/Club precisely so a stored club can't go stale after a transfer (see
 * app/api/watchlist/route.ts), so fetching them here would only duplicate a
 * value the app already resolves better elsewhere.
 */
export const MY_WATCHLISTS = `
query MyWatchlists {
  currentUser {
    myWatchlists(sport: FOOTBALL) {
      id
      slug
      title
      createdAt
      playersPanel {
        anyPlayer {
          slug
          displayName
          anyPositions
          activeClub { ... on Club { name } }
        }
      }
    }
  }
}`;

/**
 * Spendable balance, for the in-season advisor's "can I afford to close this
 * gap" verdict. `availableBalances` splits cash from crypto: `eurCents` is the
 * fiat wallet, `wei` the ETH one with its own EUR equivalent attached — the
 * two together are the real buying power, which is why both are read.
 */
export const MY_FUNDS = `
query MyFunds {
  currentUser {
    slug
    nickname
    availableBalances {
      eurCents { eurCents }
      wei { wei eurCents }
    }
  }
}`;

/**
 * Per-game history behind the Appearance table and the internal form model.
 *
 * Rebuilt on `anyPlayer(slug)`: `football.player` and `allSo5Scores` are both
 * gone from the current schema, so the old document 422'd on every player and
 * quietly wrote nothing but error rows to the sync log. `first` (not `last`)
 * is deliberate — allPlayerGameScores is ordered by *descending* game date,
 * so `last` returns the player's oldest games, which is how you end up
 * modelling current form off 2018 fixtures.
 *
 * Bonus of the rewrite: `anyPlayer` is public, so form no longer needs a login.
 */
export const PLAYER_FORM = `
query PlayerForm($slug: String!, $last: Int!) {
  anyPlayer(slug: $slug) {
    slug
    displayName
    anyPositions
    activeClub { ... on Club { slug name } }
    activeInjuries { status expectedEndDate }
    allPlayerGameScores(first: $last) {
      nodes {
        score
        anyPlayerGameStats {
          # formationPlace is the only reliable "did he start": non-zero means
          # he was in the starting XI. Verified against real data — a starter
          # subbed at half time has minsPlayed 45 and formationPlace 11, while
          # a one-minute substitute has minsPlayed 1 and formationPlace 0. Any
          # minutes-based rule gets both of those wrong.
          ... on PlayerGameStats { minsPlayed onGameSheet formationPlace }
        }
        anyGame { id date competition { displayName } }
      }
    }
  }
}`;

// Player search and the marketplace floor moved to lib/services/market.ts,
// on the public API (lib/sorare/publicClient.ts) — see that file for why:
// `football.player`/`football.players` no longer exist on the current schema.

/**
 * Every single-sale offer this account has completed, newest first — the
 * real transaction record (settled price, settled date), not an inference
 * from a CSV that went missing a card. `senderSide` is the seller's side of
 * the trade (the card given up); `receiverSide` is what the seller got back
 * (the money). Only single-sale (fixed-price) offers — auctions and direct
 * trades aren't covered by this connection.
 */
export const SOLD_SINGLE_SALE_OFFERS = `
query SoldOffers($first: Int, $after: String) {
  currentUser {
    soldSingleSaleTokenOffers(sport: [FOOTBALL], first: $first, after: $after, sortByEndDate: DESC) {
      nodes {
        id
        transactionDate
        endDate
        senderSide {
          anyCards {
            slug
            anyPlayer { slug displayName }
          }
        }
        receiverSide {
          amounts { eurCents usdCents referenceCurrency wei }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

/**
 * Same shape, the buy side — used only to backfill boughtPrice when the CSV
 * didn't have it. senderSide/receiverSide are fixed to the offer itself, not
 * to "me": the seller always sends the card (senderSide.anyCards), the buyer
 * always receives it and pays for it (receiverSide.amounts) — same
 * convention already relied on in lib/services/scouting.ts's
 * liveSingleSaleOffer.receiverSide.amounts for a listing's asking price. On
 * this connection I'm always the buyer, so I'm the receiver here.
 */
export const BOUGHT_SINGLE_SALE_OFFERS = `
query BoughtOffers($first: Int, $after: String) {
  currentUser {
    boughtSingleSaleTokenOffers(sport: [FOOTBALL], first: $first, after: $after, sortByEndDate: DESC) {
      nodes {
        id
        transactionDate
        endDate
        senderSide {
          anyCards { slug }
        }
        receiverSide {
          amounts { eurCents usdCents referenceCurrency wei }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
