import { describe, it, expect } from "vitest";
import { scoreColor, SCORE_COLOR_CLASS, u23Status, u23SortValue, compareNullable, rarityOf, RARITY_CLASS } from "./types";

describe("scoreColor", () => {
  it("is neutral for null/undefined", () => {
    expect(scoreColor(null)).toBe("neutral");
    expect(scoreColor(undefined)).toBe("neutral");
  });

  it("is warn below 40", () => {
    expect(scoreColor(0)).toBe("warn");
    expect(scoreColor(39.9)).toBe("warn");
  });

  it("is neutral between 40 and 59.9", () => {
    expect(scoreColor(40)).toBe("neutral");
    expect(scoreColor(59.9)).toBe("neutral");
  });

  it("is ok at 60 and above", () => {
    expect(scoreColor(60)).toBe("ok");
    expect(scoreColor(100)).toBe("ok");
  });

  it("every band has a matching CSS class", () => {
    for (const band of ["warn", "neutral", "ok"] as const) {
      expect(SCORE_COLOR_CLASS[band]).toMatch(/^text-/);
    }
  });
});

describe("u23Status", () => {
  it("returns null without a birth date", () => {
    expect(u23Status(null)).toBeNull();
  });

  it("returns null for an unparsable date", () => {
    expect(u23Status("not-a-date")).toBeNull();
  });

  it("is eligible for someone who just turned 22", () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 22);
    const status = u23Status(dob.toISOString());
    expect(status?.eligible).toBe(true);
  });

  it("is not eligible for someone well past 24 regardless of birth month", () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 25);
    dob.setDate(dob.getDate() - 1); // past every possible July 1st cutoff
    const status = u23Status(dob.toISOString());
    expect(status?.eligible).toBe(false);
  });

  it("stays eligible for a full extra season when born after July 1st (birthday hasn't hit the last cutoff yet)", () => {
    // Born 2003-08-15: at the 2026-07-01 cutoff they're still 22 (birthday
    // not yet reached that year), so they stay U23 through the whole
    // 2027-2028 season too, only dropping out on 2028-07-01.
    const status = u23Status("2003-08-15T00:00:00.000Z");
    expect(status?.validUntil.getUTCFullYear()).toBe(2028);
    expect(status?.validUntil.getUTCMonth()).toBe(6); // July, 0-indexed
    expect(status?.validUntil.getUTCDate()).toBe(1);
  });

  it("validUntil is July 1st of the year the player turns 24 as of that cutoff (born on/before July 1st)", () => {
    // Born 2003-06-15: already 24 as of 2027-07-01 (birthday passed), so
    // switches out then rather than waiting for the 2027-06-15 birthday.
    const status = u23Status("2003-06-15T00:00:00.000Z");
    expect(status?.validUntil.getUTCFullYear()).toBe(2027);
    expect(status?.validUntil.getUTCMonth()).toBe(6); // July, 0-indexed
    expect(status?.validUntil.getUTCDate()).toBe(1);
  });
});

describe("u23SortValue", () => {
  it("is null for a non-eligible or unknown player", () => {
    expect(u23SortValue(null)).toBeNull();
    const old = new Date();
    old.setFullYear(old.getFullYear() - 30);
    expect(u23SortValue(old.toISOString())).toBeNull();
  });

  it("is the 23rd-birthday timestamp for an eligible player", () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 20); // safely still U23 today
    expect(u23SortValue(dob.toISOString())).toBe(u23Status(dob.toISOString())?.validUntil.getTime());
  });

  it("ranks a younger eligible player above an older one on descending sort (most time left first)", () => {
    const young = new Date();
    young.setFullYear(young.getFullYear() - 19);
    const old = new Date();
    old.setFullYear(old.getFullYear() - 22);

    const youngValue = u23SortValue(young.toISOString())!;
    const oldValue = u23SortValue(old.toISOString())!;
    expect(youngValue).toBeGreaterThan(oldValue);
  });
});

describe("compareNullable", () => {
  it("sorts known values ascending or descending", () => {
    expect(compareNullable(1, 2, "asc")).toBeLessThan(0);
    expect(compareNullable(1, 2, "desc")).toBeGreaterThan(0);
    expect(compareNullable(5, 5, "asc")).toBe(0);
  });

  it("always sends null/undefined last, regardless of direction", () => {
    expect(compareNullable(null, 5, "asc")).toBeGreaterThan(0);
    expect(compareNullable(null, 5, "desc")).toBeGreaterThan(0);
    expect(compareNullable(5, null, "asc")).toBeLessThan(0);
    expect(compareNullable(5, null, "desc")).toBeLessThan(0);
    expect(compareNullable(undefined, 5, "asc")).toBeGreaterThan(0);
  });

  it("treats two unknowns as equal", () => {
    expect(compareNullable(null, undefined, "asc")).toBe(0);
    expect(compareNullable(null, null, "desc")).toBe(0);
  });

  it("sorting an array with mixed nulls keeps them all at the end", () => {
    const xs = [3, null, 1, null, 2];
    const sortedAsc = [...xs].sort((a, b) => compareNullable(a, b, "asc"));
    expect(sortedAsc).toEqual([1, 2, 3, null, null]);
    const sortedDesc = [...xs].sort((a, b) => compareNullable(a, b, "desc"));
    expect(sortedDesc).toEqual([3, 2, 1, null, null]);
  });
});

describe("rarityOf", () => {
  it("resolves known rarities", () => {
    expect(rarityOf("unique")).toBe(RARITY_CLASS.unique);
    expect(rarityOf("super_rare")).toBe(RARITY_CLASS.super_rare);
  });

  it("falls back to common for unknown values", () => {
    expect(rarityOf("bogus")).toBe(RARITY_CLASS.common);
  });
});
