import { describe, it, expect } from "vitest";
import { isFriendly } from "./playerDetail";

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
