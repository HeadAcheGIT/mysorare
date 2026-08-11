import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { parseGalleryCsv, type GalleryRow } from "./csvParse";

/**
 * Imports a SorareScore "my gallery" CSV export.
 *
 * This is the reliable path to knowing which cards you own. The Sorare API
 * route to the same data (`currentUser.cards`) needs an authenticated token,
 * and Sorare re-triggers 2FA whenever the requesting IP changes — which on
 * serverless is every invocation. A CSV you export on demand has no such
 * failure mode, and everything else about a player is public (see
 * lib/services/enrich.ts).
 *
 * Written as bulk INSERT ... ON CONFLICT rather than per-row upserts. Prisma
 * sends the statements in a transaction sequentially, so 800 upserts meant 800
 * round trips to a database that may be on another continent — enough to blow
 * past the function timeout and return a 504. Each chunk below is a single
 * round trip instead.
 */

export type ImportResult = {
  cards: number;
  players: number;
  removed: number;
  skipped: string[];
};

/** Kept well under Postgres' 65535 bound parameters per statement. */
const CHUNK = 250;

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

async function upsertPlayers(rows: GalleryRow[], now: Date): Promise<void> {
  for (const part of chunk(rows, CHUNK)) {
    const values = part.map(
      (r) => Prisma.sql`(${r.playerSlug}, ${r.displayName}, ${r.position}, ${r.age}, ${now})`
    );
    // Enrichment (photo, club, injuries) lives on the same table but is never
    // touched here — a re-import must not wipe what the public API filled in.
    await prisma.$executeRaw`
      INSERT INTO "Player" ("slug", "displayName", "position", "age", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("slug") DO UPDATE SET
        "displayName" = EXCLUDED."displayName",
        "position"    = EXCLUDED."position",
        "age"         = EXCLUDED."age",
        "updatedAt"   = EXCLUDED."updatedAt"
    `;
  }
}

async function upsertCards(rows: GalleryRow[], now: Date): Promise<void> {
  for (const part of chunk(rows, CHUNK)) {
    const values = part.map(
      (r) => Prisma.sql`(${r.cardSlug}, ${r.playerSlug}, ${r.rarity}, ${r.season}, ${r.serialNumber},
        ${r.inSeason}, 'csv', ${r.l10}, ${r.price}, ${r.floorPrice}, ${r.estimatedPrice},
        ${r.boughtPrice}, ${now})`
    );
    await prisma.$executeRaw`
      INSERT INTO "Card" ("slug", "playerSlug", "rarity", "season", "serialNumber",
                          "inSeason", "source", "l10", "price", "floorPrice",
                          "estimatedPrice", "boughtPrice", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("slug") DO UPDATE SET
        "playerSlug"     = EXCLUDED."playerSlug",
        "rarity"         = EXCLUDED."rarity",
        "season"         = EXCLUDED."season",
        "serialNumber"   = EXCLUDED."serialNumber",
        "inSeason"       = EXCLUDED."inSeason",
        "source"         = EXCLUDED."source",
        "l10"            = EXCLUDED."l10",
        "price"          = EXCLUDED."price",
        "floorPrice"     = EXCLUDED."floorPrice",
        "estimatedPrice" = EXCLUDED."estimatedPrice",
        "boughtPrice"    = EXCLUDED."boughtPrice",
        "updatedAt"      = EXCLUDED."updatedAt"
    `;
  }
}

export async function importGalleryCsv(text: string): Promise<ImportResult> {
  const { rows, skipped } = parseGalleryCsv(text);
  if (!rows.length) throw new Error("Aucune carte exploitable dans ce fichier.");

  // One row per player: a gallery holds several cards of the same player, and
  // Postgres rejects an ON CONFLICT statement that touches a row twice.
  const playerRows = new Map<string, GalleryRow>();
  for (const row of rows) if (!playerRows.has(row.playerSlug)) playerRows.set(row.playerSlug, row);

  // Same rule for cards — a duplicated slug in the export would abort the whole
  // statement rather than just that row.
  const cardRows = new Map<string, GalleryRow>();
  for (const row of rows) cardRows.set(row.cardSlug, row);

  const now = new Date();
  await upsertPlayers([...playerRows.values()], now);
  // Cards reference players, so they have to land second.
  await upsertCards([...cardRows.values()], now);

  // The export is the full gallery, so any CSV-sourced card missing from it has
  // been sold or transferred. API-sourced cards are left alone. Captured as a
  // Sale before deletion so the history survives — see lib/services/sales.ts.
  const vanished = await prisma.card.findMany({
    where: { source: "csv", slug: { notIn: [...cardRows.keys()] } },
    include: { player: { select: { displayName: true } } },
  });
  if (vanished.length) {
    await prisma.sale.createMany({
      data: vanished.map((c) => ({
        cardSlug: c.slug,
        playerSlug: c.playerSlug,
        playerName: c.player.displayName,
        rarity: c.rarity,
        season: c.season,
        serialNumber: c.serialNumber,
        boughtPrice: c.boughtPrice,
        lastKnownPrice: c.price,
        lastFloorPrice: c.floorPrice,
        lastEstimatedPrice: c.estimatedPrice,
      })),
      skipDuplicates: true,
    });
  }

  const removed = await prisma.card.deleteMany({
    where: { source: "csv", slug: { notIn: [...cardRows.keys()] } },
  });

  await prisma.syncLog.create({
    data: {
      job: "csv_import",
      status: "ok",
      detail: `${cardRows.size} cartes, ${playerRows.size} joueurs, ${removed.count} retirées${
        skipped.length ? `, ${skipped.length} ignorées` : ""
      }`,
    },
  });

  return {
    cards: cardRows.size,
    players: playerRows.size,
    removed: removed.count,
    skipped,
  };
}
