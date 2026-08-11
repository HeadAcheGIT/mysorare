import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../prisma";
import { importGalleryCsv } from "./csvImport";

const HEADER = "Card Slug,Player Name,Position,Age,In Season,L10,Price,Floor Price,Estimated Price,Bought Price";

function csv(rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

async function cleanDb() {
  await prisma.sale.deleteMany();
  await prisma.card.deleteMany();
  await prisma.player.deleteMany();
  await prisma.club.deleteMany();
}

describe("importGalleryCsv — sale capture on disappearance", () => {
  beforeEach(cleanDb);
  afterAll(cleanDb);

  it("imports new cards and players", async () => {
    const result = await importGalleryCsv(
      csv(["kylian-mbappe-2024-limited-7,Kylian Mbappé,Forward,25,Yes,72.5,120,110,130,95"])
    );
    expect(result.cards).toBe(1);
    expect(result.players).toBe(1);
    expect(result.removed).toBe(0);

    const card = await prisma.card.findUnique({ where: { slug: "kylian-mbappe-2024-limited-7" } });
    expect(card?.source).toBe("csv");
    expect(card?.boughtPrice).toBe(95);
  });

  it("records a Sale and deletes the Card when it vanishes from a later export", async () => {
    await importGalleryCsv(
      csv(["kylian-mbappe-2024-limited-7,Kylian Mbappé,Forward,25,Yes,72.5,120,110,130,95"])
    );

    // Second import: the gallery no longer contains that card — it was sold or transferred.
    const result = await importGalleryCsv(csv(["erling-haaland-2024-rare-3,Erling Haaland,Forward,24,Yes,88,,,,"]));

    expect(result.removed).toBe(1);

    const goneCard = await prisma.card.findUnique({ where: { slug: "kylian-mbappe-2024-limited-7" } });
    expect(goneCard).toBeNull();

    const sale = await prisma.sale.findUnique({ where: { cardSlug: "kylian-mbappe-2024-limited-7" } });
    expect(sale).not.toBeNull();
    expect(sale?.playerSlug).toBe("kylian-mbappe");
    expect(sale?.playerName).toBe("Kylian Mbappé");
    expect(sale?.rarity).toBe("limited");
    expect(sale?.season).toBe(2024);
    expect(sale?.serialNumber).toBe(7);
    expect(sale?.boughtPrice).toBe(95);
    // Best-effort valuation, not a confirmed sale price — see the Sale model's own doc comment.
    expect(sale?.lastKnownPrice).toBe(120);
    expect(sale?.lastFloorPrice).toBe(110);
    expect(sale?.lastEstimatedPrice).toBe(130);
  });

  it("does not touch API-sourced cards when they're absent from the CSV", async () => {
    await prisma.player.create({ data: { slug: "api-only-player", displayName: "API Only", position: "Defender" } });
    await prisma.card.create({
      data: { slug: "api-only-player-2024-rare-1", playerSlug: "api-only-player", rarity: "rare", source: "api" },
    });

    const result = await importGalleryCsv(
      csv(["kylian-mbappe-2024-limited-7,Kylian Mbappé,Forward,25,Yes,,,,,"])
    );

    expect(result.removed).toBe(0);
    const apiCard = await prisma.card.findUnique({ where: { slug: "api-only-player-2024-rare-1" } });
    expect(apiCard).not.toBeNull();
    // And no Sale should have been fabricated for a card that was never "removed".
    const sale = await prisma.sale.findUnique({ where: { cardSlug: "api-only-player-2024-rare-1" } });
    expect(sale).toBeNull();
  });

  it("does not create a duplicate Sale row if run twice against the same disappearance", async () => {
    await importGalleryCsv(csv(["kylian-mbappe-2024-limited-7,Kylian Mbappé,Forward,25,Yes,,120,,,95"]));
    await importGalleryCsv(csv(["erling-haaland-2024-rare-3,Erling Haaland,Forward,24,Yes,,,,,"]));
    // A second, identical "empty of that card" import shouldn't error or duplicate.
    await importGalleryCsv(csv(["erling-haaland-2024-rare-3,Erling Haaland,Forward,24,Yes,,,,,"]));

    const sales = await prisma.sale.findMany({ where: { cardSlug: "kylian-mbappe-2024-limited-7" } });
    expect(sales).toHaveLength(1);
  });

  it("keeps a card that is re-listed in the same export it was previously present in", async () => {
    await importGalleryCsv(csv(["kylian-mbappe-2024-limited-7,Kylian Mbappé,Forward,25,Yes,,,,,"]));
    const result = await importGalleryCsv(csv(["kylian-mbappe-2024-limited-7,Kylian Mbappé,Forward,26,No,,,,,"]));

    expect(result.removed).toBe(0);
    const card = await prisma.card.findUnique({ where: { slug: "kylian-mbappe-2024-limited-7" } });
    expect(card).not.toBeNull();
    expect(card?.inSeason).toBe(false); // updated by the second import
  });
});
