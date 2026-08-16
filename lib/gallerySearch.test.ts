import { describe, it, expect } from "vitest";
import { fold, matchesSearch, searchTerms, type SearchableCard } from "./gallerySearch";

const mbappe: SearchableCard = {
  name: "Kylian Mbappé",
  club: "Real Madrid",
  competitionName: "LALIGA EA Sports",
  position: "Forward",
  rarity: "limited",
  season: 2026,
  inSeason: true,
};

const lopez: SearchableCard = {
  name: "Maxime Lopez",
  club: "Paris FC",
  competitionName: "Ligue 1",
  position: "Midfielder",
  rarity: "limited",
  season: 2023,
  inSeason: false,
};

const find = (card: SearchableCard, q: string) => matchesSearch(card, searchTerms(q));

describe("fold", () => {
  it("strips accents and case", () => {
    expect(fold("Mbappé")).toBe("mbappe");
    expect(fold("Anderson Talisca")).toBe("anderson talisca");
  });

  it("handles several diacritics in one name", () => {
    expect(fold("Ødegaard Nuñez Çalhanoğlu")).toContain("nunez");
  });
});

describe("matchesSearch", () => {
  it("finds an accented name typed without accents", () => {
    // The everyday failure of the old substring match.
    expect(find(mbappe, "mbappe")).toBe(true);
  });

  it("matches on club", () => {
    expect(find(mbappe, "real")).toBe(true);
  });

  it("requires every word, so a second word narrows", () => {
    expect(find(lopez, "lopez paris")).toBe(true);
    expect(find(lopez, "lopez madrid")).toBe(false);
  });

  it("matches words that live in different fields", () => {
    // "lopez" is the name, "ligue" the competition — no single field has both.
    expect(find(lopez, "lopez ligue")).toBe(true);
  });

  it("matches a French position label", () => {
    expect(find(lopez, "milieu")).toBe(true);
    expect(find(mbappe, "attaquant")).toBe(true);
    expect(find(mbappe, "milieu")).toBe(false);
  });

  it("matches a rarity", () => {
    expect(find(mbappe, "limited")).toBe(true);
  });

  it("matches a season year", () => {
    expect(find(lopez, "2023")).toBe(true);
    expect(find(lopez, "2026")).toBe(false);
  });

  it("matches in-season only for in-season cards", () => {
    expect(find(mbappe, "in-season")).toBe(true);
    expect(find(lopez, "in-season")).toBe(false);
  });

  it("returns everything for an empty or whitespace query", () => {
    expect(find(lopez, "")).toBe(true);
    expect(find(lopez, "   ")).toBe(true);
  });

  it("ignores surrounding whitespace and repeated spaces", () => {
    expect(find(lopez, "  lopez   paris ")).toBe(true);
  });

  it("survives a card with no club or league", () => {
    const orphan: SearchableCard = { name: "Joueur Sans Club", position: "Defender" };
    expect(find(orphan, "joueur")).toBe(true);
    expect(find(orphan, "joueur marseille")).toBe(false);
  });

  it("is case-insensitive on the query", () => {
    expect(find(mbappe, "MBAPPE")).toBe(true);
  });
});
