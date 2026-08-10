import { prisma } from "../prisma";
import { parseGalleryCsv } from "./csvParse";

/**
 * Imports a SorareScore "my gallery" CSV export.
 *
 * This is the reliable path to knowing which cards you own. The Sorare API
 * route to the same data (`currentUser.cards`) needs an authenticated token,
 * and Sorare re-triggers 2FA whenever the requesting IP changes — which on
 * serverless is every invocation. A CSV you export on demand has no such
 * failure mode, and everything else about a player is public (see
 * lib/services/enrich.ts).
 */

export type ImportResult = {
  cards: number;
  players: number;
  removed: number;
  skipped: string[];
};

export async function importGalleryCsv(text: string): Promise<ImportResult> {
  const { rows, skipped } = parseGalleryCsv(text);
  if (!rows.length) throw new Error("Aucune carte exploitable dans ce fichier.");

  // One row per player, keeping the first occurrence — a gallery holds several
  // cards of the same player and they'd otherwise fight over the same write.
  const playerRows = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!playerRows.has(row.playerSlug)) playerRows.set(row.playerSlug, row);

  const seenPlayers = new Set(playerRows.keys());
  const seenCards = new Set(rows.map((r) => r.cardSlug));

  // Batched writes: a 400-card gallery is ~800 statements, and issuing them
  // one at a time against a remote database takes longer than the function is
  // allowed to run. Chunks commit independently so a slow import still makes
  // progress instead of rolling everything back.
  const CHUNK = 50;

  // Only writes what the CSV actually knows. Photos, club and injuries are
  // left untouched so a re-import never wipes enrichment already fetched.
  const players = [...playerRows.values()];
  for (let i = 0; i < players.length; i += CHUNK) {
    await prisma.$transaction(
      players.slice(i, i + CHUNK).map((row) =>
        prisma.player.upsert({
          where: { slug: row.playerSlug },
          create: {
            slug: row.playerSlug,
            displayName: row.displayName,
            position: row.position,
            age: row.age,
          },
          update: { displayName: row.displayName, position: row.position, age: row.age },
        })
      )
    );
  }

  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.$transaction(
      rows.slice(i, i + CHUNK).map((row) => {
        const data = {
          playerSlug: row.playerSlug,
          rarity: row.rarity,
          season: row.season,
          serialNumber: row.serialNumber,
          inSeason: row.inSeason,
          source: "csv",
          l10: row.l10,
          price: row.price,
          floorPrice: row.floorPrice,
          estimatedPrice: row.estimatedPrice,
          boughtPrice: row.boughtPrice,
        };
        return prisma.card.upsert({
          where: { slug: row.cardSlug },
          create: { slug: row.cardSlug, ...data },
          update: data,
        });
      })
    );
  }

  // The export is the full gallery, so any CSV-sourced card missing from it
  // has been sold or transferred. API-sourced cards are left alone.
  const stale = await prisma.card.findMany({
    where: { source: "csv", slug: { notIn: [...seenCards] } },
    select: { slug: true },
  });
  if (stale.length) {
    await prisma.card.deleteMany({ where: { slug: { in: stale.map((c) => c.slug) } } });
  }

  await prisma.syncLog.create({
    data: {
      job: "csv_import",
      status: "ok",
      detail: `${seenCards.size} cartes, ${seenPlayers.size} joueurs, ${stale.length} retirées${
        skipped.length ? `, ${skipped.length} ignorées` : ""
      }`,
    },
  });

  return { cards: seenCards.size, players: seenPlayers.size, removed: stale.length, skipped };
}
