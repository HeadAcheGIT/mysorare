import { describe, it, expect } from "vitest";
import { isFriendly, latestCardSupply } from "./playerDetail";

describe("isFriendly", () => {
  it("is false for null/empty competition", () => {
    expect(isFriendly(null)).toBe(false);
    expect(isFriendly("")).toBe(false);
  });

  it("is false for a normal league/cup competition", () => {
    expect(isFriendly("Ligue 1")).toBe(false);
    expect(isFriendly("UEFA Champions League")).toBe(false);
    expect(isFriendly("Coupe de France")).toBe(false);
  });

  it("matches English 'friendly' competitions", () => {
    expect(isFriendly("International Friendlies")).toBe(true);
    expect(isFriendly("Club Friendly")).toBe(true);
  });

  it("matches French 'amical' competitions", () => {
    expect(isFriendly("Match amical")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isFriendly("INTERNATIONAL FRIENDLIES")).toBe(true);
  });
});

describe("latestCardSupply", () => {
  it("is null with no rows", () => {
    expect(latestCardSupply([])).toBeNull();
  });

  it("picks the row with the highest season, regardless of input order", () => {
    const rows = [
      { limited: 95, rare: 13, season: { startYear: 2026 } },
      { limited: 749, rare: 83, season: { startYear: 2025 } },
      { limited: 247, rare: 57, season: { startYear: 2023 } },
    ];
    expect(latestCardSupply(rows)).toEqual({ season: 2026, limited: 95, rare: 13 });
  });
});
