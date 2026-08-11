import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../prisma";

/**
 * No dedicated lib/services/watchlist.ts exists — the logic lives directly in
 * app/api/watchlist/route.ts. These tests exercise the same Prisma calls that
 * route makes, which is what actually matters here: this is the regression
 * test for the migration bug caught during Lot 4 testing (DROP CONSTRAINT
 * silently not dropping the old single-column unique INDEX — see
 * prisma/migrations/4_watchlist_groups/migration.sql).
 */

async function cleanDb() {
  await prisma.watchlistItem.deleteMany();
  await prisma.watchlistGroup.deleteMany();
}

describe("watchlist groups — multi-list support", () => {
  beforeEach(cleanDb);
  afterAll(cleanDb);

  it("allows the same player to be added to two different lists", async () => {
    const groupA = await prisma.watchlistGroup.create({ data: { name: "Cibles Ligue 1" } });
    const groupB = await prisma.watchlistGroup.create({ data: { name: "Bons plans" } });

    await prisma.watchlistItem.upsert({
      where: { playerSlug_groupId: { playerSlug: "kylian-mbappe", groupId: groupA.id } },
      create: { playerSlug: "kylian-mbappe", label: "Kylian Mbappé", groupId: groupA.id },
      update: { label: "Kylian Mbappé" },
    });
    await prisma.watchlistItem.upsert({
      where: { playerSlug_groupId: { playerSlug: "kylian-mbappe", groupId: groupB.id } },
      create: { playerSlug: "kylian-mbappe", label: "Kylian Mbappé", groupId: groupB.id },
      update: { label: "Kylian Mbappé" },
    });

    const items = await prisma.watchlistItem.findMany({ where: { playerSlug: "kylian-mbappe" } });
    expect(items).toHaveLength(2);
  });

  it("upserts rather than duplicates when the same player is added twice to the same list", async () => {
    const group = await prisma.watchlistGroup.create({ data: { name: "Cibles" } });

    for (let i = 0; i < 2; i++) {
      await prisma.watchlistItem.upsert({
        where: { playerSlug_groupId: { playerSlug: "erling-haaland", groupId: group.id } },
        create: { playerSlug: "erling-haaland", label: "Erling Haaland", groupId: group.id },
        update: { label: "Erling Haaland (updated)" },
      });
    }

    const items = await prisma.watchlistItem.findMany({ where: { playerSlug: "erling-haaland" } });
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("Erling Haaland (updated)");
  });

  it("cascades: deleting a group deletes its items", async () => {
    const group = await prisma.watchlistGroup.create({ data: { name: "Temp list" } });
    await prisma.watchlistItem.create({
      data: { playerSlug: "some-player", label: "Some Player", groupId: group.id },
    });

    await prisma.watchlistGroup.delete({ where: { id: group.id } });

    const items = await prisma.watchlistItem.findMany({ where: { groupId: group.id } });
    expect(items).toHaveLength(0);
  });

  it("removing one list's entry for a player leaves the other list's entry intact", async () => {
    const groupA = await prisma.watchlistGroup.create({ data: { name: "List A" } });
    const groupB = await prisma.watchlistGroup.create({ data: { name: "List B" } });
    await prisma.watchlistItem.create({ data: { playerSlug: "p1", label: "P1", groupId: groupA.id } });
    await prisma.watchlistItem.create({ data: { playerSlug: "p1", label: "P1", groupId: groupB.id } });

    await prisma.watchlistItem.delete({
      where: { playerSlug_groupId: { playerSlug: "p1", groupId: groupA.id } },
    });

    const remaining = await prisma.watchlistItem.findMany({ where: { playerSlug: "p1" } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].groupId).toBe(groupB.id);
  });
});
