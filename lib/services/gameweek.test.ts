import { describe, it, expect } from "vitest";
import { sameCompetition } from "./gameweek";

const club = (slug: string | null) => ({ domesticLeague: slug ? { slug } : null });

describe("sameCompetition", () => {
  it("is true for two clubs in the same league", () => {
    expect(sameCompetition(club("ligue-1-fr"), club("ligue-1-fr"))).toBe(true);
  });

  it("is false across leagues — a Ligue 1 rank cannot be read against a Bundesliga one", () => {
    expect(sameCompetition(club("ligue-1-fr"), club("bundesliga-de"))).toBe(false);
  });

  it("is false when either side is unknown, rather than assuming", () => {
    expect(sameCompetition(club("ligue-1-fr"), club(null))).toBe(false);
    expect(sameCompetition(club(null), club("ligue-1-fr"))).toBe(false);
    expect(sameCompetition(null, club("ligue-1-fr"))).toBe(false);
    expect(sameCompetition(club("ligue-1-fr"), null)).toBe(false);
  });
});
