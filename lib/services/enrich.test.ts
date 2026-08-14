import { describe, it, expect } from "vitest";
import { parseDate, providerNameFromUrl } from "./enrich";

describe("parseDate", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate("")).toBeNull();
  });

  it("parses a valid ISO date string", () => {
    const d = parseDate("2026-03-15T00:00:00.000Z");
    expect(d).toBeInstanceOf(Date);
    expect(d?.getUTCFullYear()).toBe(2026);
  });

  it("returns null for an unparsable string", () => {
    expect(parseDate("not-a-date")).toBeNull();
  });

  it("returns null for a raw timestamp number — String() doesn't produce a parsable date", () => {
    // Documents an actual quirk of the implementation (new Date(String(v))),
    // not a desired behaviour: a numeric epoch millis value does NOT parse.
    expect(parseDate(1710000000000)).toBeNull();
  });
});

describe("providerNameFromUrl", () => {
  it("returns null for null/undefined", () => {
    expect(providerNameFromUrl(null)).toBeNull();
    expect(providerNameFromUrl(undefined)).toBeNull();
  });

  it("derives a capitalised name from the hostname", () => {
    expect(providerNameFromUrl("https://www.genius.com/redirect")).toBe("Genius");
    expect(providerNameFromUrl("https://sportmonks.com")).toBe("Sportmonks");
  });

  it("returns null for an unparsable URL", () => {
    expect(providerNameFromUrl("not-a-url")).toBeNull();
  });
});
