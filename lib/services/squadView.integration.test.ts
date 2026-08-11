import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../prisma";
import { getSquadView } from "./squadView";
import { isStale } from "../sparkline";

async function cleanDb() {
  await prisma.appearance.deleteMany();
  await prisma.projectionSource.deleteMany();
  await prisma.projection.deleteMany();
  await prisma.override.deleteMany();
  await prisma.card.deleteMany();
  await prisma.player.deleteMany();
  await prisma.club.deleteMany();
}

describe("getSquadView — lastPlayedAt (the Héctor Holguín regression)", () => {
  beforeEach(cleanDb);
  afterAll(cleanDb);

  it("surfaces the most recent Appearance date so a stale player can be flagged", async () => {
    await prisma.club.create({
      data: { slug: "club-a", name: "Club A", competitionSlug: "liga-es", competitionName: "LaLiga" },
    });
    await prisma.player.create({
      data: {
        slug: "hector-holguin",
        displayName: "Héctor Holguín",
        position: "Defender",
        clubSlug: "club-a",
        recentScores: JSON.stringify([45, 38]), // only 2 played games, both long ago
      },
    });
    await prisma.card.create({
      data: { slug: "hector-holguin-2024-limited-1", playerSlug: "hector-holguin", rarity: "limited" },
    });

    const oldGame = new Date(Date.now() - 110 * 86_400_000);
    const olderGame = new Date(Date.now() - 107 * 86_400_000);
    await prisma.appearance.createMany({
      data: [
        { playerSlug: "hector-holguin", gameId: "g1", gameDate: oldGame, minutes: 90, score: 45 },
        { playerSlug: "hector-holguin", gameId: "g2", gameDate: olderGame, minutes: 90, score: 38 },
      ],
    });

    const { cards } = await getSquadView(null);
    const card = cards.find((c) => c.playerSlug === "hector-holguin");

    expect(card?.lastPlayedAt).not.toBeNull();
    // The reported bug: 2 real appearances 107-110 days ago must read as STALE,
    // not as "recent form" — this is exactly what the Sparkline uses to decide.
    expect(isStale(card!.lastPlayedAt)).toBe(true);
    expect(card?.competitionName).toBe("LaLiga");
  });

  it("is not stale for a player who played within the last few days", async () => {
    await prisma.player.create({ data: { slug: "fresh-player", displayName: "Fresh Player", position: "Forward" } });
    await prisma.card.create({
      data: { slug: "fresh-player-2024-limited-1", playerSlug: "fresh-player", rarity: "limited" },
    });
    await prisma.appearance.create({
      data: { playerSlug: "fresh-player", gameId: "g1", gameDate: new Date(Date.now() - 2 * 86_400_000), score: 60 },
    });

    const { cards } = await getSquadView(null);
    const card = cards.find((c) => c.playerSlug === "fresh-player");
    expect(isStale(card!.lastPlayedAt)).toBe(false);
  });

  it("is null (never flagged stale) for a player with no Appearance rows at all", async () => {
    await prisma.player.create({ data: { slug: "no-history", displayName: "No History", position: "Midfielder" } });
    await prisma.card.create({
      data: { slug: "no-history-2024-common-1", playerSlug: "no-history", rarity: "common" },
    });

    const { cards } = await getSquadView(null);
    const card = cards.find((c) => c.playerSlug === "no-history");
    expect(card?.lastPlayedAt).toBeNull();
    expect(isStale(card!.lastPlayedAt)).toBe(false); // unknown, not misleadingly "fine"
  });
});
