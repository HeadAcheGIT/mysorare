import { describe, it, expect } from "vitest";
import { assessAuction, rankAuctions, type AuctionOpportunity } from "./auctionWatch";

const NOW = new Date("2026-08-18T12:00:00Z");
const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();

describe("assessAuction", () => {
  it("calls a bid well under the market a bargain", () => {
    // Lopez trades at ~5 €; a bid at 3 € is 40% under.
    const a = assessAuction({ currentEur: 3, valuationEur: 5, endDate: inMinutes(20) }, NOW);
    expect(a.verdict).toBe("bonne_affaire");
    expect(a.discountPct).toBe(40);
  });

  it("calls a bid past the market too expensive", () => {
    const a = assessAuction({ currentEur: 7, valuationEur: 5, endDate: inMinutes(60) }, NOW);
    expect(a.verdict).toBe("trop_cher");
    expect(a.discountPct!).toBeLessThan(0);
  });

  it("calls a bid around the market neither", () => {
    expect(assessAuction({ currentEur: 5.2, valuationEur: 5, endDate: inMinutes(60) }, NOW).verdict).toBe("au_prix");
  });

  it("refuses to judge without a valuation", () => {
    const a = assessAuction({ currentEur: 3, valuationEur: null, endDate: inMinutes(20) }, NOW);
    expect(a.verdict).toBe("inconnu");
    expect(a.discountPct).toBeNull();
  });

  it("refuses to judge without a convertible bid", () => {
    expect(assessAuction({ currentEur: null, valuationEur: 5, endDate: inMinutes(20) }, NOW).verdict).toBe("inconnu");
  });

  it("flags an auction closing within the half hour", () => {
    expect(assessAuction({ currentEur: 3, valuationEur: 5, endDate: inMinutes(25) }, NOW).endingSoon).toBe(true);
    expect(assessAuction({ currentEur: 3, valuationEur: 5, endDate: inMinutes(90) }, NOW).endingSoon).toBe(false);
  });

  it("marks a finished auction as ended rather than urgent", () => {
    const a = assessAuction({ currentEur: 3, valuationEur: 5, endDate: inMinutes(-5) }, NOW);
    expect(a.ended).toBe(true);
    expect(a.endingSoon).toBe(false);
  });

  it("handles an unparsable end date without throwing", () => {
    const a = assessAuction({ currentEur: 3, valuationEur: 5, endDate: "bientôt" }, NOW);
    expect(a.minutesLeft).toBeNull();
    expect(a.ended).toBe(false);
  });
});

describe("rankAuctions", () => {
  const row = (label: string, o: Partial<AuctionOpportunity>) => ({
    label,
    opportunity: {
      discountPct: null,
      minutesLeft: null,
      endingSoon: false,
      ended: false,
      verdict: "inconnu" as const,
      ...o,
    },
  });

  it("puts a closing bargain above a distant one", () => {
    const out = rankAuctions([
      row("loin", { discountPct: 40, minutesLeft: 20 * 60 }),
      row("bientôt", { discountPct: 40, minutesLeft: 15 }),
    ]);
    expect(out[0].label).toBe("bientôt");
  });

  it("prefers the deeper discount at equal urgency", () => {
    const out = rankAuctions([
      row("petite", { discountPct: 10, minutesLeft: 60 }),
      row("grosse", { discountPct: 45, minutesLeft: 60 }),
    ]);
    expect(out[0].label).toBe("grosse");
  });

  it("sinks finished auctions whatever their price", () => {
    const out = rankAuctions([
      row("finie", { discountPct: 90, minutesLeft: -1, ended: true }),
      row("en cours", { discountPct: 5, minutesLeft: 200 }),
    ]);
    expect(out[0].label).toBe("en cours");
    expect(out[1].label).toBe("finie");
  });

  it("does not reorder an already-sorted list arbitrarily", () => {
    const rows = [row("a", { discountPct: 30, minutesLeft: 30 }), row("b", { discountPct: 10, minutesLeft: 30 })];
    expect(rankAuctions(rows).map((r) => r.label)).toEqual(["a", "b"]);
  });

  it("leaves the input untouched", () => {
    const rows = [row("a", { discountPct: 1 }), row("b", { discountPct: 99 })];
    rankAuctions(rows);
    expect(rows[0].label).toBe("a");
  });
});
