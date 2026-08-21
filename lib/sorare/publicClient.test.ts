import { describe, it, expect } from "vitest";
import { PLAYERS_PER_QUERY, CARDS_PER_OWNERSHIP_QUERY } from "./publicClient";

/**
 * Guards against the failure that broke enrichment and acquisition pricing
 * outright: a page size chosen once, then invalidated by fields being added
 * to the query, with nothing failing until a keyless user ran a sync.
 *
 * The ceilings are the largest sizes measured as *accepted* by the live API
 * against the 500 unauthenticated complexity cap (13 players scored 508,
 * 7 cards scored 505). No API key is configured under test, so these are the
 * keyless values. Raising a page size past its ceiling means re-measuring
 * against the API, not editing the number here.
 */
const PLAYERS_CEILING = 12;
const OWNERSHIP_CEILING = 6;

describe("unauthenticated page sizes", () => {
  it("keeps PLAYERS_BY_SLUG batches under Sorare's keyless complexity cap", () => {
    expect(PLAYERS_PER_QUERY).toBeGreaterThan(0);
    expect(PLAYERS_PER_QUERY).toBeLessThanOrEqual(PLAYERS_CEILING);
  });

  it("gives CARD_OWNERSHIP_PUBLIC its own, much smaller batch", () => {
    expect(CARDS_PER_OWNERSHIP_QUERY).toBeGreaterThan(0);
    expect(CARDS_PER_OWNERSHIP_QUERY).toBeLessThanOrEqual(OWNERSHIP_CEILING);
    // An ownership chain costs roughly twice a player, so sharing the player
    // page size — as this once did — is what put it over the cap.
    expect(CARDS_PER_OWNERSHIP_QUERY).toBeLessThan(PLAYERS_PER_QUERY);
  });
});
