import { describe, it, expect } from "vitest";
import { dedupeByPlayer, type Insight } from "./insights";

const insight = (playerSlug: string, cardSlug: string, weight: number, reason = "15/15 matchs"): Insight => ({
  kind: "underused",
  cardSlug,
  playerSlug,
  name: playerSlug,
  picture: null,
  club: null,
  position: "Goalkeeper",
  rarity: "limited",
  birthDate: null,
  competitionName: null,
  reason,
  weight,
  value: weight,
  boughtPrice: null,
  expected: null,
  pStart: null,
});

describe("dedupeByPlayer", () => {
  it("keeps one row per player, the heaviest one", () => {
    const out = dedupeByPlayer([
      insight("mike-maignan", "mike-maignan-2022-limited-1", 10),
      insight("mike-maignan", "mike-maignan-2023-rare-8", 40),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].cardSlug).toBe("mike-maignan-2023-rare-8");
  });

  it("says how many copies were collapsed, rather than hiding them", () => {
    const out = dedupeByPlayer([
      insight("mike-maignan", "a", 10),
      insight("mike-maignan", "b", 40),
      insight("mike-maignan", "c", 20),
    ]);
    expect(out[0].reason).toBe("15/15 matchs · ×3 cartes");
  });

  it("leaves a single card's reason untouched", () => {
    const out = dedupeByPlayer([insight("harry-kane", "a", 10)]);
    expect(out[0].reason).toBe("15/15 matchs");
  });

  it("does not merge different players", () => {
    const out = dedupeByPlayer([insight("a", "a1", 1), insight("b", "b1", 2)]);
    expect(out.map((i) => i.playerSlug).sort()).toEqual(["a", "b"]);
  });

  it("returns an empty list untouched", () => {
    expect(dedupeByPlayer([])).toEqual([]);
  });
});
