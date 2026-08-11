import { describe, it, expect } from "vitest";
import { classifyPriceChange, findTransferHeadline, TRANSFER_KEYWORDS } from "./alerts";

describe("classifyPriceChange", () => {
  it("is null without a previous price", () => {
    expect(classifyPriceChange(null, 100)).toEqual({ kind: null, detail: null });
    expect(classifyPriceChange(undefined, 100)).toEqual({ kind: null, detail: null });
  });

  it("is null when previous price is zero or negative (avoids division by zero)", () => {
    expect(classifyPriceChange(0, 100)).toEqual({ kind: null, detail: null });
    expect(classifyPriceChange(-5, 100)).toEqual({ kind: null, detail: null });
  });

  it("flags price_down for a drop of 10% or more", () => {
    const result = classifyPriceChange(100, 89);
    expect(result.kind).toBe("price_down");
    expect(result.detail).toContain("-11%");
  });

  it("flags price_up for a rise of 10% or more", () => {
    const result = classifyPriceChange(100, 111);
    expect(result.kind).toBe("price_up");
    expect(result.detail).toContain("+11%");
  });

  it("is null for a move within the threshold", () => {
    expect(classifyPriceChange(100, 105)).toEqual({ kind: null, detail: null });
    expect(classifyPriceChange(100, 95)).toEqual({ kind: null, detail: null });
  });

  it("is exactly at the boundary (10.0%) on the alerting side", () => {
    expect(classifyPriceChange(100, 90).kind).toBe("price_down");
    expect(classifyPriceChange(100, 110).kind).toBe("price_up");
  });

  it("respects a custom threshold", () => {
    expect(classifyPriceChange(100, 103, 0.02).kind).toBe("price_up");
    expect(classifyPriceChange(100, 103, 0.5).kind).toBeNull();
  });
});

describe("TRANSFER_KEYWORDS / findTransferHeadline", () => {
  it("matches common French and English transfer vocabulary", () => {
    for (const title of [
      "Le mercato s'accélère pour ce joueur",
      "Player signs new deal with rivals",
      "Il quitte son club après 5 ans",
      "Prêté pour la saison",
      "Rumeur : transfert imminent",
    ]) {
      expect(TRANSFER_KEYWORDS.test(title)).toBe(true);
    }
  });

  it("does not match ordinary match-report headlines", () => {
    for (const title of [
      "Match report: 3-1 win at home",
      "Player scores brace in derby",
      "Injury update ahead of the weekend",
    ]) {
      expect(TRANSFER_KEYWORDS.test(title)).toBe(false);
    }
  });

  it("findTransferHeadline returns the first matching item", () => {
    const items = [
      { title: "Nothing to see here" },
      { title: "He signs for a new club" },
      { title: "Another transfer headline" },
    ];
    expect(findTransferHeadline(items)?.title).toBe("He signs for a new club");
  });

  it("findTransferHeadline returns null when nothing matches", () => {
    expect(findTransferHeadline([{ title: "Calm news day" }])).toBeNull();
  });

  it("findTransferHeadline returns null for an empty list", () => {
    expect(findTransferHeadline([])).toBeNull();
  });
});
