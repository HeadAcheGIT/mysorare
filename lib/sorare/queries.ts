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
          position
          age
          activeInjuries { status expectedEndDate }
          activeClub { ... on Club { slug name country { code } } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export const OPEN_FIXTURES = `
query OpenFixtures {
  football {
    so5 {
      so5Fixtures(first: 3) {
        nodes { slug startDate endDate aasmState }
      }
    }
  }
}`;

export const PLAYER_FORM = `
query PlayerForm($slug: String!, $last: Int!) {
  football {
    player(slug: $slug) {
      slug
      displayName
      position
      activeClub { ... on Club { slug name } }
      activeInjuries { status expectedEndDate }
      allSo5Scores(last: $last) {
        nodes {
          score
          playerGameStats {
            minsPlayed
            onGameSheet
            game { id date competition { displayName } }
          }
        }
      }
    }
  }
}`;

/**
 * Search-by-name + live marketplace floor. Sorare's search field and the
 * exact shape of card listings drift between seasons more than most of the
 * schema — if this errors, `curl -o schema.graphql https://api.sorare.com/graphql/schema`
 * and grep for `players(` and `liveSingleSaleOffer` to fix the field names.
 */
export const SEARCH_PLAYERS = `
query SearchPlayers($search: String!) {
  football {
    players(name: $search, first: 8) {
      slug
      displayName
      position
      activeClub { ... on Club { name } }
    }
  }
}`;

export const PLAYER_MARKET = `
query PlayerMarket($slug: String!) {
  football {
    player(slug: $slug) {
      slug
      displayName
      cards(first: 15) {
        nodes {
          slug
          rarityTyped
          serialNumber
          liveSingleSaleOffer {
            receiverSide { amounts { eur } }
          }
        }
      }
    }
  }
}`;
