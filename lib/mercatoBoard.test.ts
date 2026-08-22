import { describe, it, expect } from "vitest";
import { buildMercatoLists, filterByReason, countByReason } from "./mercatoBoard";
import type { SquadCard } from "./types";
import type { PlayerAlert } from "@/app/components/AlertBadges";
import type { MercatoSignalRow } from "./services/mercato";

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
    ...overrides,
  };
}

const transferAlert = (stage: string, sourceCount = 2): PlayerAlert => ({
  kind: "transfer",
  detail: "headline",
  stage,
  sourceCount,
  sourceNames: "L'Équipe, RMC",
  headlineUrl: "https://example.com/a",
  headlineTitle: "Some headline",
  headlineDate: "2026-08-20",
});

describe("buildMercatoLists", () => {
  it("puts a mid-negotiation transfer in the risk list", () => {
    const squad = [card({ playerSlug: "a" })];
    const { risks, opportunities } = buildMercatoLists(
      squad,
      { a: [transferAlert("negotiation")] },
      new Set(["ligue-1"]),
      {}
    );
    expect(risks).toHaveLength(1);
    expect(risks[0].reasons.map((r) => r.code)).toEqual(["transfer"]);
    expect(opportunities).toHaveLength(0);
  });

  it("ranks officialisé above simple contact", () => {
    const squad = [card({ playerSlug: "a" }), card({ playerSlug: "b" })];
    const { risks } = buildMercatoLists(
      squad,
      { a: [transferAlert("contact")], b: [transferAlert("official")] },
      new Set(["ligue-1"]),
      {}
    );
    expect(risks.map((r) => r.card.playerSlug)).toEqual(["b", "a"]);
  });

  it("flags a starting-time drop as risk and a rise as opportunity", () => {
    const squad = [card({ playerSlug: "down" }), card({ playerSlug: "up" })];
    const signals: Record<string, MercatoSignalRow> = {
      down: { startTrend: { direction: "down", recentPct: 10, priorPct: 80, delta: -0.7 }, formTrend: null },
      up: { startTrend: { direction: "up", recentPct: 80, priorPct: 10, delta: 0.7 }, formTrend: null },
    };
    const { risks, opportunities } = buildMercatoLists(squad, {}, new Set(["ligue-1"]), signals);
    expect(risks.map((r) => r.card.playerSlug)).toEqual(["down"]);
    expect(opportunities.map((r) => r.card.playerSlug)).toEqual(["up"]);
  });

  it("flags an uncovered league as risk, but only once the league set has actually loaded", () => {
    const squad = [card({ playerSlug: "a", competitionSlug: "obscure-league" })];
    const empty = buildMercatoLists(squad, {}, new Set(), {});
    expect(empty.risks).toHaveLength(0);

    const loaded = buildMercatoLists(squad, {}, new Set(["ligue-1"]), {});
    expect(loaded.risks).toHaveLength(1);
    expect(loaded.risks[0].reasons[0].code).toBe("league_uncovered");
  });

  it("does not flag a covered league", () => {
    const squad = [card({ playerSlug: "a", competitionSlug: "ligue-1" })];
    const { risks } = buildMercatoLists(squad, {}, new Set(["ligue-1"]), {});
    expect(risks).toHaveLength(0);
  });

  it("can list the same player under both risk and opportunity", () => {
    const squad = [card({ playerSlug: "a" })];
    const signals: Record<string, MercatoSignalRow> = {
      a: { startTrend: null, formTrend: { delta: 20 } },
    };
    const { risks, opportunities } = buildMercatoLists(
      squad,
      { a: [transferAlert("agreement")] },
      new Set(["ligue-1"]),
      signals
    );
    expect(risks.map((r) => r.card.playerSlug)).toEqual(["a"]);
    expect(opportunities.map((r) => r.card.playerSlug)).toEqual(["a"]);
  });

  it("dedupes multiple cards of the same player into one row", () => {
    const squad = [
      card({ playerSlug: "a", cardSlug: "a-1" }),
      card({ playerSlug: "a", cardSlug: "a-2" }),
    ];
    const { risks } = buildMercatoLists(squad, { a: [transferAlert("contact")] }, new Set(["ligue-1"]), {});
    expect(risks).toHaveLength(1);
  });

  it("returns empty lists when nothing is moving", () => {
    const squad = [card({ playerSlug: "a" })];
    const { risks, opportunities } = buildMercatoLists(squad, {}, new Set(["ligue-1"]), {});
    expect(risks).toHaveLength(0);
    expect(opportunities).toHaveLength(0);
  });
});

describe("filterByReason", () => {
  const squad = [
    card({ playerSlug: "down", competitionSlug: "ligue-1" }),
    card({ playerSlug: "uncovered", competitionSlug: "obscure-league" }),
  ];
  const signals: Record<string, MercatoSignalRow> = {
    down: { startTrend: { direction: "down", recentPct: 10, priorPct: 80, delta: -0.7 }, formTrend: null },
  };
  const { risks } = buildMercatoLists(squad, {}, new Set(["ligue-1"]), signals);

  it("returns everything untouched when no codes are selected", () => {
    expect(filterByReason(risks, new Set())).toHaveLength(2);
  });

  it("narrows to only the players carrying a selected code", () => {
    const out = filterByReason(risks, new Set(["start_down"]));
    expect(out.map((i) => i.card.playerSlug)).toEqual(["down"]);
  });

  it("is OR across multiple selected codes, not AND", () => {
    const out = filterByReason(risks, new Set(["start_down", "league_uncovered"]));
    expect(out.map((i) => i.card.playerSlug).sort()).toEqual(["down", "uncovered"]);
  });

  it("returns nothing for a code that matches no one", () => {
    expect(filterByReason(risks, new Set(["form_up"]))).toHaveLength(0);
  });
});

describe("countByReason", () => {
  it("counts one per player per code, not per reason occurrence", () => {
    const squad = [card({ playerSlug: "a" }), card({ playerSlug: "b" })];
    const { risks } = buildMercatoLists(
      squad,
      { a: [transferAlert("contact")], b: [transferAlert("official")] },
      new Set(["ligue-1"]),
      {}
    );
    expect(countByReason(risks)).toEqual({ transfer: 2 });
  });

  it("returns an empty object for an empty list", () => {
    expect(countByReason([])).toEqual({});
  });
});
