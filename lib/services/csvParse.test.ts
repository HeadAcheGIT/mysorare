import { describe, it, expect } from "vitest";
import { parseCsv, parseCardSlug, parseNumber, parseGalleryCsv } from "./csvParse";

describe("parseCsv", () => {
  it("splits a simple comma-separated table", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCsv('name,note\n"Doe, John",hello\n')).toEqual([
      ["name", "note"],
      ["Doe, John", "hello"],
    ]);
  });

  it('unescapes doubled quotes ("" -> ")', () => {
    expect(parseCsv('field\n"She said ""hi"""\n')).toEqual([["field"], ['She said "hi"']]);
  });

  it("ignores a trailing blank line", () => {
    expect(parseCsv("a,b\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips carriage returns from CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCardSlug", () => {
  it("parses a well-formed card slug", () => {
    expect(parseCardSlug("pierre-kalulu-2023-limited-42")).toEqual({
      playerSlug: "pierre-kalulu",
      season: 2023,
      rarity: "limited",
      serialNumber: 42,
    });
  });

  it("handles player slugs that themselves contain digits and dashes", () => {
    expect(parseCardSlug("joao-pedro-2-2024-unique-1")).toEqual({
      playerSlug: "joao-pedro-2",
      season: 2024,
      rarity: "unique",
      serialNumber: 1,
    });
  });

  it("returns null for a malformed slug", () => {
    expect(parseCardSlug("not-a-card-slug")).toBeNull();
    expect(parseCardSlug("player-2023-mythical-1")).toBeNull(); // unknown rarity
  });
});

describe("parseNumber", () => {
  it("parses plain numeric strings", () => {
    expect(parseNumber("42")).toBe(42);
    expect(parseNumber("3.5")).toBe(3.5);
  });

  it('treats "N/A" (any case) and blanks as unknown', () => {
    expect(parseNumber("N/A")).toBeNull();
    expect(parseNumber("n/a")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
  });

  it("returns null for undefined and non-numeric input", () => {
    expect(parseNumber(undefined)).toBeNull();
    expect(parseNumber("abc")).toBeNull();
  });
});

describe("parseGalleryCsv", () => {
  const header = "Card Slug,Player Name,Position,Age,In Season,L10,Price,Floor Price,Estimated Price,Bought Price";

  it("parses a well-formed export", () => {
    const csv = [
      header,
      "kylian-mbappe-2024-limited-7,Kylian Mbappé,Forward,25,Yes,72.5,120.00,110.00,130.00,95.00",
    ].join("\n");

    const { rows, skipped } = parseGalleryCsv(csv);
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cardSlug: "kylian-mbappe-2024-limited-7",
      playerSlug: "kylian-mbappe",
      displayName: "Kylian Mbappé",
      position: "Forward",
      age: 25,
      season: 2024,
      rarity: "limited",
      serialNumber: 7,
      inSeason: true,
      l10: 72.5,
      price: 120,
      floorPrice: 110,
      estimatedPrice: 130,
      boughtPrice: 95,
    });
  });

  it("collects unparsable card slugs as skipped rather than throwing", () => {
    const csv = [header, "not-a-valid-slug,Someone,Defender,20,No,,,,,"].join("\n");
    const { rows, skipped } = parseGalleryCsv(csv);
    expect(rows).toEqual([]);
    expect(skipped).toEqual(["not-a-valid-slug"]);
  });

  it("defaults an unrecognised position to Midfielder", () => {
    const csv = [header, "some-player-2024-common-1,Some Player,Goalkeeper-ish,,No,,,,,"].join("\n");
    const { rows } = parseGalleryCsv(csv);
    expect(rows[0].position).toBe("Midfielder");
  });

  it("throws when required columns are missing", () => {
    expect(() => parseGalleryCsv("foo,bar\n1,2\n")).toThrow(/Card Slug/);
  });

  it("throws on an empty/unreadable file", () => {
    expect(() => parseGalleryCsv("")).toThrow(/vide/);
  });

  it("keeps only the last row per duplicate card slug is the caller's job, not the parser's", () => {
    // parseGalleryCsv itself is dumb-and-honest: it returns every row as-is,
    // de-duplication happens in csvImport.ts.
    const csv = [
      header,
      "kylian-mbappe-2024-limited-7,Kylian Mbappé,Forward,25,Yes,,,,,",
      "kylian-mbappe-2024-limited-7,Kylian Mbappé,Forward,25,No,,,,,",
    ].join("\n");
    const { rows } = parseGalleryCsv(csv);
    expect(rows).toHaveLength(2);
  });
});
