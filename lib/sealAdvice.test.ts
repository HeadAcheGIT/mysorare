import { describe, it, expect } from "vitest";
import { reasonsForSeal, buildSealAdvice } from "./sealAdvice";
import type { SquadCard } from "./types";

function card(overrides: Partial<SquadCard> & { playerSlug: string }): SquadCard {
  return {
    cardSlug: `${overrides.playerSlug}-card`,
    name: overrides.playerSlug,
    position: "Midfielder",
    rarity: "limited",
    season: null,
    inSeason: true,
    serial: null,
    bonus: 0,
    club: "Some Club",
    clubSlug: "some-club",
    clubPicture: null,
    injury: null,
    suspended: false,
    pStart: null,
    pPlay: null,
    pStartBasis: null,
    sorareStarterOdds: null,
    confidence: null,
    expected: null,
    floor: null,
    l5: null,
    l15: null,
    note: null,
    excluded: false,
    picture: null,
    country: null,
    age: null,
    birthDate: null,
    shirtNumber: null,
    sorareProjection: null,
    recentScores: [],
    lastPlayedAt: null,
    competitionSlug: "ligue-1",
    competitionName: "Ligue 1",
    l10: null,
    price: null,
    floorPrice: null,
    estimatedPrice: null,
    boughtPrice: null,
    sealedAt: null,
    ...overrides,
  };
}

const covered = new Set(["ligue-1", "premier-league"]);

describe("reasonsForSeal", () => {
  it("is empty for a covered, active, clubbed player", () => {
    expect(reasonsForSeal(card({ playerSlug: "a" }), covered)).toEqual([]);
  });

  it("flags a player with no club", () => {
    const reasons = reasonsForSeal(card({ playerSlug: "a", clubSlug: null, club: null }), covered);
    expect(reasons.map((r) => r.code)).toEqual(["no_club"]);
  });

  it("flags a player in an uncovered league", () => {
    const reasons = reasonsForSeal(
      card({ playerSlug: "a", competitionSlug: "obscure-league", competitionName: "Obscure League" }),
      covered
    );
    expect(reasons.map((r) => r.code)).toEqual(["league_uncovered"]);
  });

  it("does not flag league coverage when the covered set hasn't loaded yet", () => {
    const reasons = reasonsForSeal(card({ playerSlug: "a", competitionSlug: "obscure-league" }), new Set());
    expect(reasons).toEqual([]);
  });

  it("flags a long-inactive player", () => {
    const longAgo = new Date(Date.now() - 250 * 24 * 60 * 60 * 1000).toISOString();
    const reasons = reasonsForSeal(card({ playerSlug: "a", lastPlayedAt: longAgo }), covered);
    expect(reasons.map((r) => r.code)).toEqual(["inactive"]);
  });

  it("does not double-flag inactivity for a player already flagged as clubless", () => {
    const longAgo = new Date(Date.now() - 250 * 24 * 60 * 60 * 1000).toISOString();
    const reasons = reasonsForSeal(
      card({ playerSlug: "a", clubSlug: null, club: null, lastPlayedAt: longAgo }),
      covered
    );
    expect(reasons.map((r) => r.code)).toEqual(["no_club"]);
  });

  it("can combine league_uncovered and inactive", () => {
    const longAgo = new Date(Date.now() - 250 * 24 * 60 * 60 * 1000).toISOString();
    const reasons = reasonsForSeal(
      card({ playerSlug: "a", competitionSlug: "obscure-league", lastPlayedAt: longAgo }),
      covered
    );
    expect(reasons.map((r) => r.code).sort()).toEqual(["inactive", "league_uncovered"]);
  });
});

describe("buildSealAdvice", () => {
  it("buckets sealed, suggested and keep separately", () => {
    const sealedCard = card({ playerSlug: "sealed", sealedAt: new Date().toISOString(), clubSlug: null });
    const suggestedCard = card({ playerSlug: "suggested", clubSlug: null });
    const keepCard = card({ playerSlug: "keep" });

    const { sealed, suggested, keep } = buildSealAdvice([sealedCard, suggestedCard, keepCard], covered);

    expect(sealed.map((r) => r.card.playerSlug)).toEqual(["sealed"]);
    expect(suggested.map((r) => r.card.playerSlug)).toEqual(["suggested"]);
    expect(keep.map((r) => r.card.playerSlug)).toEqual(["keep"]);
  });

  it("puts an already-sealed card in sealed even if it would also match a seal reason", () => {
    const sealedCard = card({ playerSlug: "sealed", sealedAt: new Date().toISOString(), clubSlug: null });
    const { sealed, suggested } = buildSealAdvice([sealedCard], covered);
    expect(sealed).toHaveLength(1);
    expect(suggested).toHaveLength(0);
  });

  it("keeps two cards of the same player in separate buckets", () => {
    const sealedCopy = card({ playerSlug: "dup", cardSlug: "dup-1", sealedAt: new Date().toISOString() });
    const unsealedCopy = card({ playerSlug: "dup", cardSlug: "dup-2" });
    const { sealed, keep } = buildSealAdvice([sealedCopy, unsealedCopy], covered);
    expect(sealed.map((r) => r.card.cardSlug)).toEqual(["dup-1"]);
    expect(keep.map((r) => r.card.cardSlug)).toEqual(["dup-2"]);
  });
});
