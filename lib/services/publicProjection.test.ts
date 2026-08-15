import { describe, it, expect } from "vitest";
import {
  projectFromPublic,
  recencyWeightedStartRate,
  fixtureDifficultyFactor,
  type PublicInput,
} from "./publicProjection";

const input = (over: Partial<PublicInput> = {}): PublicInput => ({
  position: "Forward",
  app5: null,
  app15: null,
  avgL5: null,
  avgL15: null,
  avgL10Played: null,
  sorareProjection: null,
  recentScores: [],
  injured: false,
  suspended: false,
  hasClub: true,
  cardBonus: 0,
  ...over,
});

describe("recencyWeightedStartRate", () => {
  it("is null with no history", () => {
    expect(recencyWeightedStartRate([])).toBeNull();
  });

  it("is 1 when every game was a start", () => {
    const out = recencyWeightedStartRate([{ started: true }, { started: true }]);
    expect(out?.rate).toBe(1);
    expect(out?.sample).toBe(2);
  });

  it("is 0 when none were", () => {
    expect(recencyWeightedStartRate([{ started: false }, { started: false }])?.rate).toBe(0);
  });

  it("weights recent games more — a player who just broke into the XI reads higher than a flat average", () => {
    // Newest first: started the last three, benched the four before.
    const games = [
      { started: true },
      { started: true },
      { started: true },
      { started: false },
      { started: false },
      { started: false },
      { started: false },
    ];
    const out = recencyWeightedStartRate(games, 5)!;
    expect(out.rate).toBeGreaterThan(3 / 7);
  });

  it("mirrors that for a player who just lost his place", () => {
    const games = [
      { started: false },
      { started: false },
      { started: false },
      { started: true },
      { started: true },
      { started: true },
      { started: true },
    ];
    expect(recencyWeightedStartRate(games, 5)!.rate).toBeLessThan(4 / 7);
  });
});

describe("fixtureDifficultyFactor", () => {
  it("is neutral when nothing is known", () => {
    expect(fixtureDifficultyFactor(null, null, null)).toBe(1);
  });

  it("favours facing a weaker-ranked opponent", () => {
    expect(fixtureDifficultyFactor(2, 18, null)).toBeGreaterThan(1);
  });

  it("penalises facing a stronger one", () => {
    expect(fixtureDifficultyFactor(18, 2, null)).toBeLessThan(1);
  });

  it("is neutral between equally-ranked clubs", () => {
    expect(fixtureDifficultyFactor(7, 7, null)).toBe(1);
  });

  it("gives home a small edge and away a small penalty", () => {
    expect(fixtureDifficultyFactor(null, null, true)).toBeGreaterThan(1);
    expect(fixtureDifficultyFactor(null, null, false)).toBeLessThan(1);
  });

  /** Bounded on purpose: league position is a blunt proxy and must not dominate the projection. */
  it("caps the swing even for an extreme mismatch", () => {
    expect(fixtureDifficultyFactor(1, 200, true)).toBeLessThanOrEqual(1.16);
    expect(fixtureDifficultyFactor(200, 1, false)).toBeGreaterThanOrEqual(0.84);
  });

  it("ignores nonsense rankings rather than trusting them", () => {
    expect(fixtureDifficultyFactor(0, 5, null)).toBe(1);
    expect(fixtureDifficultyFactor(5, 0, null)).toBe(1);
  });
});

describe("projectFromPublic — what pStart measures", () => {
  it("marks appearance-only data as such rather than calling it a start rate", () => {
    const out = projectFromPublic(input({ app5: 5, app15: 15 }));
    expect(out.pStartBasis).toBe("appearances");
    // This is the trap the whole fix is about: five appearances in five games
    // says he plays, not that he starts.
    expect(out.pStart).toBe(out.pPlay);
  });

  it("uses real starting data when it exists, and says so", () => {
    const out = projectFromPublic(input({ app5: 5, app15: 15, startRate: 0.2, startSample: 15 }));
    expect(out.pStartBasis).toBe("starts");
    expect(out.pStart).toBeLessThan(out.pPlay);
  });

  it("separates the regular substitute who always plays from a starter", () => {
    // Plays every game, but off the bench each time.
    const sub = projectFromPublic(input({ app5: 5, app15: 15, startRate: 0, startSample: 15 }));
    const starter = projectFromPublic(input({ app5: 5, app15: 15, startRate: 1, startSample: 15 }));

    expect(sub.pPlay).toBeCloseTo(starter.pPlay, 5);
    expect(sub.pStart).toBeLessThan(starter.pStart);
    // Before the fix both of these read as a ~100% "titulaire".
    expect(sub.pStart).toBeLessThan(0.4);
  });

  it("never lets p(start) exceed p(play) — starting implies playing", () => {
    const out = projectFromPublic(input({ app5: 1, app15: 2, startRate: 1, startSample: 15 }));
    expect(out.pStart).toBeLessThanOrEqual(out.pPlay);
  });

  it("drives the expected score off p(play), so a scoring substitute isn't written off", () => {
    const sub = projectFromPublic(
      input({ app5: 5, app15: 15, avgL10Played: 60, startRate: 0, startSample: 15 })
    );
    // He plays every week and scores 60 when he does — the projection has to
    // reflect that even though he never starts.
    expect(sub.expected).toBeGreaterThan(40);
  });

  it("is more confident when it knows about starts than when it is guessing from appearances", () => {
    const guessed = projectFromPublic(input({ app5: 5, app15: 15, avgL10Played: 50 }));
    const known = projectFromPublic(
      input({ app5: 5, app15: 15, avgL10Played: 50, startRate: 0.9, startSample: 15 })
    );
    expect(known.confidence).toBeGreaterThan(guessed.confidence);
  });

  it("zeroes both probabilities for an injury or suspension", () => {
    for (const over of [{ injured: true }, { suspended: true }]) {
      const out = projectFromPublic(input({ app5: 5, app15: 15, startRate: 1, startSample: 15, ...over }));
      expect(out.pStart).toBe(0);
      expect(out.pPlay).toBe(0);
      expect(out.expected).toBe(0);
    }
  });

  it("zeroes a player with no club", () => {
    const out = projectFromPublic(input({ hasClub: false, app5: 5, app15: 15 }));
    expect(out.pStart).toBe(0);
    expect(out.expected).toBe(0);
  });

  it("scores the same player higher against a weak opponent than a strong one", () => {
    const base = { app5: 5, app15: 15, avgL10Played: 60, startRate: 1, startSample: 15 };
    const easy = projectFromPublic(input({ ...base, ownRank: 2, opponentRank: 18, isHome: true }));
    const hard = projectFromPublic(input({ ...base, ownRank: 18, opponentRank: 2, isHome: false }));

    // Before this, both returned an identical projection.
    expect(easy.expected).toBeGreaterThan(hard.expected);
    expect(easy.note).toContain("favorable");
    expect(hard.note).toContain("difficile");
  });

  it("leaves the projection untouched when the fixture is unknown", () => {
    const base = { app5: 5, app15: 15, avgL10Played: 60 };
    const withFixture = projectFromPublic(input({ ...base, ownRank: 7, opponentRank: 7, isHome: null }));
    const without = projectFromPublic(input(base));
    expect(withFixture.expected).toBe(without.expected);
  });

  it("falls back to the position baseline with nothing to go on", () => {
    const out = projectFromPublic(input());
    expect(out.pStartBasis).toBe("baseline");
    expect(out.pStart).toBeGreaterThan(0);
    expect(out.note).toContain("Aucune donnée");
  });
});
