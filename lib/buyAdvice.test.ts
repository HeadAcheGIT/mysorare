import { describe, it, expect } from "vitest";
import { bestByPosition, rankUpgrades, weakestPosition, type Candidate, type OwnedCard } from "./buyAdvice";

const owned: OwnedCard[] = [
  { position: "Goalkeeper", expected: 40 },
  { position: "Defender", expected: 55 },
  { position: "Midfielder", expected: 70 },
  { position: "Forward", expected: 65 },
];

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  playerSlug: "x",
  playerName: "X",
  position: "Goalkeeper",
  expected: 60,
  price: 10,
  ...over,
});

describe("bestByPosition", () => {
  it("keeps the highest score per position", () => {
    const m = bestByPosition([...owned, { position: "Goalkeeper", expected: 50 }]);
    expect(m.get("Goalkeeper")).toBe(50);
  });

  it("ignores cards with no projection", () => {
    expect(bestByPosition([{ position: "Forward", expected: null }]).size).toBe(0);
  });
});

describe("rankUpgrades", () => {
  it("measures the gain against the best card already owned in that position", () => {
    // GK owned at 40, candidate at 60 → +20 for 10 € = 2 pts/€.
    const [u] = rankUpgrades(owned, [cand()], 100);
    expect(u.gain).toBe(20);
    expect(u.gainPerEuro).toBe(2);
  });

  it("drops candidates that would not improve the line-up", () => {
    // A 60 midfielder behind an owned 70 adds nothing, however cheap.
    expect(rankUpgrades(owned, [cand({ position: "Midfielder", price: 1 })], 100)).toEqual([]);
  });

  it("treats a position with no card as a pure gain", () => {
    const [u] = rankUpgrades([], [cand()], 100);
    expect(u.currentBest).toBeNull();
    expect(u.gain).toBe(60);
  });

  it("ranks by points per euro, not by raw score", () => {
    // The stronger card is the worse value here.
    const rows = rankUpgrades(
      owned,
      [cand({ playerSlug: "cher", expected: 80, price: 100 }), cand({ playerSlug: "bon-plan", expected: 60, price: 5 })],
      1000
    );
    expect(rows[0].playerSlug).toBe("bon-plan");
  });

  it("puts what you can afford first", () => {
    const rows = rankUpgrades(
      owned,
      [cand({ playerSlug: "hors-budget", expected: 90, price: 500 }), cand({ playerSlug: "abordable", expected: 50, price: 5 })],
      10
    );
    expect(rows[0].playerSlug).toBe("abordable");
    expect(rows[1].affordable).toBe(false);
  });

  it("reports affordability as unknown rather than guessing", () => {
    // A missing balance must not silently hide an option.
    const [u] = rankUpgrades(owned, [cand()], null);
    expect(u.affordable).toBeNull();
  });

  it("puts unpriced candidates last instead of treating them as free", () => {
    const rows = rankUpgrades(
      owned,
      [cand({ playerSlug: "sans-prix", price: null }), cand({ playerSlug: "avec-prix", price: 10 })],
      null
    );
    expect(rows[0].playerSlug).toBe("avec-prix");
    expect(rows[1].gainPerEuro).toBeNull();
  });

  it("never divides by a zero price", () => {
    const [u] = rankUpgrades(owned, [cand({ price: 0 })], null);
    expect(u.gainPerEuro).toBeNull();
  });

  it("ignores a candidate with no projection", () => {
    expect(rankUpgrades(owned, [cand({ expected: null })], 100)).toEqual([]);
  });
});

describe("weakestPosition", () => {
  const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

  it("finds the lowest-scoring position", () => {
    expect(weakestPosition(owned, POSITIONS)).toBe("Goalkeeper");
  });

  it("treats a position with no card at all as the weakest", () => {
    const partial = owned.filter((c) => c.position !== "Forward");
    expect(weakestPosition(partial, POSITIONS)).toBe("Forward");
  });
});
