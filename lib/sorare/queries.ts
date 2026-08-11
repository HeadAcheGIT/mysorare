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
          amounts { eurCents usdCents referenceCurrency }
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
          amounts { eurCents usdCents referenceCurrency }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
