import { describe, it, expect } from "vitest";
import { benchRisks } from "./lineupBenchRisk";
import type { SquadCard } from "./types";

function card(overrides: Partial<SquadCard> & { cardSlug: string; playerSlug: string }): SquadCard {
  return {
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

describe("benchRisks", () => {
  it("flags a card at or below the threshold", () => {
    const squad = [card({ cardSlug: "a", playerSlug: "a", pStart: 0.3 })];
    expect(benchRisks(["a"], squad).map((r) => r.cardSlug)).toEqual(["a"]);
  });

  it("does not flag a likely starter", () => {
    const squad = [card({ cardSlug: "a", playerSlug: "a", pStart: 0.8 })];
    expect(benchRisks(["a"], squad)).toEqual([]);
  });

  it("skips a card with unknown start probability", () => {
    const squad = [card({ cardSlug: "a", playerSlug: "a", pStart: null })];
    expect(benchRisks(["a"], squad)).toEqual([]);
  });

  it("skips a card no longer in the squad", () => {
    expect(benchRisks(["gone"], [])).toEqual([]);
  });

  it("sorts worst risk first", () => {
    const squad = [
      card({ cardSlug: "a", playerSlug: "a", pStart: 0.35 }),
      card({ cardSlug: "b", playerSlug: "b", pStart: 0.1 }),
    ];
    expect(benchRisks(["a", "b"], squad).map((r) => r.cardSlug)).toEqual(["b", "a"]);
  });
});
