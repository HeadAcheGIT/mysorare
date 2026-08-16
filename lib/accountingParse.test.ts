import { describe, it, expect } from "vitest";
import {
  cardSlugFrom,
  entryId,
  parseAccountingCsv,
  parseFrenchMoney,
  resolveDirection,
} from "./accountingParse";

const HEADER = "date,entry_type,operation_type,description,currency,amount,total_balance,amount_in_fiat";

/** Rows copied from the real export rather than invented. */
const REAL = [
  // Wallet purchase: signed negative, and the case that revealed credits.
  `2026-08-15 08:20:18 UTC,payment,Bid,maxime-lopez-2026-limited-33,ETH,-0.0015,0.0174,"-2,44 €"`,
  // External card charge for a won auction: POSITIVE but an outflow.
  `2021-05-04 14:22:20 UTC,payment,EnglishAuction,tae-joon-park-2021-rare-33,EUR,43.41,-,`,
  // Refund of a losing bid: positive, an inflow.
  `2023-09-13 10:00:00 UTC,cancelled_payment,Bid,tim-melia-2023-limited-220,EUR,0.9,-,`,
  // Wallet sale: signed positive.
  `2021-05-14 12:00:00 UTC,payment,Offer,tiago-alves-sales-2021-rare-20,ETH,0.018,0.05,"60,12 €"`,
  // Fee: always an outflow.
  `2023-08-15 09:00:00 UTC,payment_fee,Offer,jorge-emanuel-broun-2020-rare-35,ETH,-0.005,0.02,"-8,38 €"`,
  // Reward with no card in the description.
  `2021-05-25 10:00:00 UTC,reward,So5Reward,global_all_star_rare rank 2337,ETH,0.01,0.03,"21,78 €"`,
].join("\n");

const parse = (body: string) => parseAccountingCsv(`${HEADER}\n${body}`);

describe("parseFrenchMoney", () => {
  it("reads a French amount with a non-breaking space and symbol", () => {
    expect(parseFrenchMoney("-2,44 €")).toBeCloseTo(-2.44);
    expect(parseFrenchMoney("60,12 €")).toBeCloseTo(60.12);
  });

  it("reads a narrow non-breaking space too", () => {
    expect(parseFrenchMoney("1 234,56 €")).toBeCloseTo(1234.56);
  });

  it("reads a plain dot-decimal number", () => {
    expect(parseFrenchMoney("43.41")).toBeCloseTo(43.41);
  });

  it("returns null for blank or unparseable input, never NaN", () => {
    expect(parseFrenchMoney("")).toBeNull();
    expect(parseFrenchMoney("-")).toBeNull();
    expect(parseFrenchMoney(undefined)).toBeNull();
  });
});

describe("cardSlugFrom", () => {
  it("recognises a card slug", () => {
    expect(cardSlugFrom("maxime-lopez-2026-limited-33")).toBe("maxime-lopez-2026-limited-33");
  });

  it("rejects a reward description", () => {
    expect(cardSlugFrom("global_all_star_rare rank 2337")).toBeNull();
  });

  it("rejects empty", () => {
    expect(cardSlugFrom("")).toBeNull();
    expect(cardSlugFrom(null)).toBeNull();
  });
});

describe("resolveDirection", () => {
  it("trusts the sign on wallet rows", () => {
    expect(resolveDirection("payment", -0.0015, true)).toBe(-1);
    expect(resolveDirection("payment", 0.018, true)).toBe(1);
  });

  it("treats an unsigned external payment as an outflow", () => {
    // The 2021 auctions: positive amounts that are really purchases. Reading
    // the sign literally would flip 182 movements.
    expect(resolveDirection("payment", 43.41, false)).toBe(-1);
  });

  it("treats an unsigned refund as an inflow", () => {
    expect(resolveDirection("cancelled_payment", 0.9, false)).toBe(1);
  });

  it("treats fees as outflows", () => {
    expect(resolveDirection("payment_fee", -0.005, true)).toBe(-1);
  });
});

describe("parseAccountingCsv", () => {
  const { rows } = parse(REAL);
  const bySlug = (s: string) => rows.find((r) => r.cardSlug === s)!;

  it("parses every real row", () => {
    expect(rows).toHaveLength(6);
  });

  it("reads the Lopez purchase as 2,44 € leaving the wallet", () => {
    // The whole point: the card cost 4,87 €, the wallet only lost 2,44 €.
    const lopez = bySlug("maxime-lopez-2026-limited-33");
    expect(lopez.isWallet).toBe(true);
    expect(lopez.direction).toBe(-1);
    expect(lopez.eurAmount).toBeCloseTo(-2.44);
  });

  it("reads an external auction charge as an outflow despite its positive amount", () => {
    const auction = bySlug("tae-joon-park-2021-rare-33");
    expect(auction.isWallet).toBe(false);
    expect(auction.direction).toBe(-1);
    expect(auction.eurAmount).toBeCloseTo(-43.41);
  });

  it("reads a cancelled bid as money coming back", () => {
    const refund = bySlug("tim-melia-2023-limited-220");
    expect(refund.direction).toBe(1);
    expect(refund.eurAmount).toBeCloseTo(0.9);
  });

  it("reads a sale as an inflow at the fiat value of the day", () => {
    const sale = bySlug("tiago-alves-sales-2021-rare-20");
    expect(sale.direction).toBe(1);
    expect(sale.eurAmount).toBeCloseTo(60.12);
  });

  it("keeps a reward's description but attaches no card", () => {
    const reward = rows.find((r) => r.operationType === "So5Reward")!;
    expect(reward.cardSlug).toBeNull();
    expect(reward.description).toContain("global_all_star_rare");
    expect(reward.eurAmount).toBeCloseTo(21.78);
  });

  it("dates are parsed from the UTC format Sorare exports", () => {
    expect(bySlug("maxime-lopez-2026-limited-33").date).toBe("2026-08-15T08:20:18.000Z");
  });

  it("skips rows with no date or no amount rather than importing junk", () => {
    const { rows: r, skipped } = parse(`,payment,Bid,x,EUR,,-,\n2021-05-04 14:22:20 UTC,payment,Bid,,EUR,,-,`);
    expect(r).toHaveLength(0);
    expect(skipped).toBe(2);
  });

  it("returns nothing for an empty file", () => {
    expect(parseAccountingCsv("").rows).toHaveLength(0);
  });
});

describe("entryId", () => {
  it("is stable for the same row", () => {
    const a = entryId(["2026-08-15", "payment", "Bid", "maxime-lopez-2026-limited-33", "ETH", -0.0015]);
    const b = entryId(["2026-08-15", "payment", "Bid", "maxime-lopez-2026-limited-33", "ETH", -0.0015]);
    expect(a).toBe(b);
  });

  it("differs when any field differs", () => {
    const base = ["2026-08-15", "payment", "Bid", "x", "ETH", -0.0015];
    const other = ["2026-08-15", "payment", "Bid", "x", "ETH", -0.0016];
    expect(entryId(base)).not.toBe(entryId(other));
  });

  it("re-importing an overlapping export produces the same ids", () => {
    const first = parse(REAL).rows.map((r) =>
      entryId([r.date, r.entryType, r.operationType, r.description, r.currency, r.amount])
    );
    const second = parse(REAL).rows.map((r) =>
      entryId([r.date, r.entryType, r.operationType, r.description, r.currency, r.amount])
    );
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });
});
