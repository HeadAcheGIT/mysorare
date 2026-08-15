import { describe, it, expect } from "vitest";
import { summarizeSeason } from "./rewards";

const row = (over: Partial<Parameters<typeof summarizeSeason>[0][number]> = {}) => ({
  fixtureSlug: "gw-1",
  gameWeek: 1,
  leaderboardName: "Champion – Limited",
  division: 1,
  ranking: 10,
  score: 250,
  rewardEur: 5,
  rewardCards: 0,
  ...over,
});

describe("summarizeSeason", () => {
  it("is empty without any results", () => {
    const s = summarizeSeason([], null);
    expect(s.gameWeeks).toEqual([]);
    expect(s.totalEur).toBe(0);
    expect(s.bestRanking).toBeNull();
  });

  it("groups line-ups by game week and totals the cash", () => {
    const s = summarizeSeason(
      [row(), row({ leaderboardName: "Contender", rewardEur: 2.5 })],
      null
    );
    expect(s.gameWeeks).toHaveLength(1);
    expect(s.gameWeeks[0].entries).toHaveLength(2);
    expect(s.gameWeeks[0].totalEur).toBe(7.5);
    expect(s.lineupsPlayed).toBe(2);
  });

  it("puts the most recent game week first", () => {
    const s = summarizeSeason(
      [row({ fixtureSlug: "gw-1", gameWeek: 1 }), row({ fixtureSlug: "gw-3", gameWeek: 3 })],
      null
    );
    expect(s.gameWeeks[0].gameWeek).toBe(3);
  });

  it("counts card rewards separately from cash", () => {
    const s = summarizeSeason([row({ rewardEur: null, rewardCards: 2 })], null);
    expect(s.totalCards).toBe(2);
    expect(s.totalEur).toBe(0);
  });

  it("marks a game week pending while a ranking has no settled reward", () => {
    const s = summarizeSeason([row({ rewardEur: null, rewardCards: 0 })], null);
    expect(s.gameWeeks[0].pending).toBe(true);
  });

  it("does not mark a paid game week as pending", () => {
    expect(summarizeSeason([row({ rewardEur: 5 })], null).gameWeeks[0].pending).toBe(false);
  });

  it("keeps the best (lowest) ranking of the season", () => {
    const s = summarizeSeason([row({ ranking: 40 }), row({ ranking: 3, leaderboardName: "Contender" })], null);
    expect(s.bestRanking).toEqual({ ranking: 3, leaderboardName: "Contender", gameWeek: 1 });
  });

  it("ignores unranked line-ups when picking the best", () => {
    const s = summarizeSeason([row({ ranking: null }), row({ ranking: 12 })], null);
    expect(s.bestRanking?.ranking).toBe(12);
  });

  it("nets winnings against what the gallery cost", () => {
    const s = summarizeSeason([row({ rewardEur: 100 })], 60);
    expect(s.netEur).toBe(40);
  });

  it("reports a loss honestly", () => {
    expect(summarizeSeason([row({ rewardEur: 10 })], 60).netEur).toBe(-50);
  });

  it("refuses to call winnings a profit when the spend is unknown", () => {
    const s = summarizeSeason([row({ rewardEur: 100 })], null);
    expect(s.totalEur).toBe(100);
    expect(s.netEur).toBeNull();
  });
});
