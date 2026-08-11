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
      data: {
        playerSlug: "fresh-player",
        gameId: "g1",
        gameDate: new Date(Date.now() - 2 * 86_400_000),
        minutes: 90,
        score: 60,
      },
    });

    const { cards } = await getSquadView(null);
    const card = cards.find((c) => c.playerSlug === "fresh-player");
    expect(isStale(card!.lastPlayedAt)).toBe(false);
  });

  it("ignores an unused-substitute appearance — on the sheet is not the same as played", async () => {
    await prisma.player.create({ data: { slug: "benched", displayName: "Benched", position: "Forward" } });
    await prisma.card.create({
      data: { slug: "benched-2024-limited-1", playerSlug: "benched", rarity: "limited" },
    });
    // Really played, but months ago.
    await prisma.appearance.create({
      data: {
        playerSlug: "benched",
        gameId: "old",
        gameDate: new Date(Date.now() - 100 * 86_400_000),
        minutes: 90,
      },
    });
    // On the game sheet yesterday, never came on — must not reset the clock.
    await prisma.appearance.create({
      data: {
        playerSlug: "benched",
        gameId: "yesterday",
        gameDate: new Date(Date.now() - 1 * 86_400_000),
        minutes: 0,
        onGameSheet: true,
      },
    });

    const { cards } = await getSquadView(null);
    const card = cards.find((c) => c.playerSlug === "benched");
    expect(isStale(card!.lastPlayedAt)).toBe(true);
  });

  it("counts a club pre-season friendly as having played", async () => {
    await prisma.player.create({ data: { slug: "preseason", displayName: "Preseason", position: "Midfielder" } });
    await prisma.card.create({
      data: { slug: "preseason-2024-limited-1", playerSlug: "preseason", rarity: "limited" },
    });
    // Last competitive game long ago (summer break)...
    await prisma.appearance.create({
      data: {
        playerSlug: "preseason",
        gameId: "last-league-game",
        gameDate: new Date(Date.now() - 60 * 86_400_000),
        minutes: 90,
      },
    });
    // ...but back playing friendlies this week — the whole reason friendlies
    // are synced at all (see lib/services/friendlies.ts).
    await prisma.appearance.create({
      data: {
        playerSlug: "preseason",
        gameId: "af-12345",
        gameDate: new Date(Date.now() - 3 * 86_400_000),
        minutes: 60,
        friendly: true,
        source: "api_football",
      },
    });

    const { cards } = await getSquadView(null);
    const card = cards.find((c) => c.playerSlug === "preseason");
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
