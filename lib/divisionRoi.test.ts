import { describe, it, expect } from "vitest";
import { divisionRoi, yieldVerdict, type DivisionEntry } from "./divisionRoi";

const entry = (over: Partial<DivisionEntry> = {}): DivisionEntry => ({
  leaderboardSlug: "champion",
  leaderboardName: "Champion",
  division: 1,
  rewardEur: 10,
  rewardCards: 0,
  lineupValue: 100,
  ranking: 50,
  ...over,
});

describe("divisionRoi", () => {
  it("computes yield as cash returned per euro committed", () => {
    // 10 EUR back on 100 EUR of cards = 10 %.
    expect(divisionRoi([entry()])[0].yieldPct).toBe(10);
  });

  it("aggregates several game weeks in the same division", () => {
    const r = divisionRoi([entry(), entry({ rewardEur: 20 })])[0];
    expect(r.entries).toBe(2);
    expect(r.totalEur).toBe(30);
    expect(r.avgCapital).toBe(100);
    // 30 EUR against 200 EUR committed across two entries.
    expect(r.yieldPct).toBe(15);
  });

  it("ranks a small cheap division above a rich expensive one", () => {
    // The whole point: the bigger pool is the worse investment here.
    const rows = divisionRoi([
      entry({ leaderboardSlug: "riche", rewardEur: 40, lineupValue: 800 }),
      entry({ leaderboardSlug: "modeste", rewardEur: 8, lineupValue: 40 }),
    ]);
    expect(rows[0].leaderboardSlug).toBe("modeste");
    expect(rows[0].yieldPct).toBe(20);
    expect(rows[1].yieldPct).toBe(5);
  });

  it("excludes unvalued entries from the yield rather than inflating it", () => {
    // The 50 EUR won on an unvalued line-up must not be divided by the other
    // entry's capital.
    const r = divisionRoi([entry({ rewardEur: 10 }), entry({ rewardEur: 50, lineupValue: null })])[0];
    expect(r.totalEur).toBe(60);
    expect(r.yieldPct).toBe(10);
    expect(r.unvalued).toBe(1);
  });

  it("counts cards won separately from cash", () => {
    const r = divisionRoi([entry({ rewardEur: null, rewardCards: 2 })])[0];
    expect(r.cardsWon).toBe(2);
    expect(r.totalEur).toBe(0);
  });

  it("averages the finishing position", () => {
    const r = divisionRoi([entry({ ranking: 10 }), entry({ ranking: 30 })])[0];
    expect(r.avgRanking).toBe(20);
  });

  it("sorts a division with no measurable yield last, not first", () => {
    const rows = divisionRoi([
      entry({ leaderboardSlug: "inconnu", lineupValue: null }),
      entry({ leaderboardSlug: "connu", rewardEur: 1, lineupValue: 100 }),
    ]);
    expect(rows[0].leaderboardSlug).toBe("connu");
  });

  it("handles an empty history", () => {
    expect(divisionRoi([])).toEqual([]);
  });
});

describe("yieldVerdict", () => {
  const base = divisionRoi([entry()])[0];

  it("refuses to judge on too few entries", () => {
    expect(yieldVerdict(base).tone).toBe("neutral");
    expect(yieldVerdict(base).label).toContain("Trop peu");
  });

  it("calls a solid yield profitable once there is enough history", () => {
    expect(yieldVerdict({ ...base, entries: 10, yieldPct: 12 }).tone).toBe("ok");
  });

  it("flags a division that returns nothing", () => {
    expect(yieldVerdict({ ...base, entries: 10, yieldPct: 0 }).tone).toBe("warn");
  });
});
