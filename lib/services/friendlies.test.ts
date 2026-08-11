import { describe, it, expect } from "vitest";
import { nameKey, lastName } from "./friendlies";

/**
 * These matter more than they look: API-Football writes "J. Bellingham"
 * where Sorare writes "Jude Bellingham", and a mismatch here silently drops
 * a player's pre-season minutes rather than failing loudly.
 */
describe("nameKey", () => {
  it("strips accents", () => {
    expect(nameKey("Kylian Mbappé")).toBe("kylian mbappe");
    expect(nameKey("Vinícius Júnior")).toBe("vinicius junior");
    expect(nameKey("Íñigo Martínez")).toBe("inigo martinez");
  });

  it("lowercases and drops punctuation", () => {
    expect(nameKey("N'Golo KANTÉ")).toBe("n golo kante");
    expect(nameKey("J. Bellingham")).toBe("j bellingham");
  });

  it("collapses whitespace", () => {
    expect(nameKey("  Jude   Bellingham  ")).toBe("jude bellingham");
  });
});

describe("lastName", () => {
  it("matches an abbreviated first name against a full one", () => {
    expect(lastName("Jude Bellingham")).toBe(lastName("J. Bellingham"));
    expect(lastName("Kylian Mbappé")).toBe(lastName("K. Mbappe"));
    expect(lastName("N'Golo Kanté")).toBe(lastName("N. Kante"));
  });

  it("matches across accent spellings", () => {
    expect(lastName("Vinícius Júnior")).toBe(lastName("Vinicius Junior"));
    expect(lastName("Íñigo Martínez")).toBe(lastName("I. Martinez"));
  });

  it("does not collapse genuinely different players", () => {
    expect(lastName("Jude Bellingham")).not.toBe(lastName("Jobe Hazard"));
  });

  it("handles a single-word name", () => {
    expect(lastName("Rodri")).toBe("rodri");
  });

  it("returns empty string for junk input rather than throwing", () => {
    expect(lastName("")).toBe("");
    expect(lastName("...")).toBe("");
  });
});
