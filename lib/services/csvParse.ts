/**
 * Pure parsing for the SorareScore gallery export — no database, no network,
 * so it can be exercised on its own. lib/services/csvImport.ts wraps this with
 * the persistence side.
 */

/** Minimal RFC-4180 parser: handles quoted fields, embedded commas, "" escapes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

/**
 * `pierre-kalulu-2023-limited-42` → player `pierre-kalulu`, season 2023,
 * rarity limited, serial 42. Player slugs can themselves contain digits and
 * dashes, so the season/rarity/serial triple is anchored to the end.
 */
const SLUG_RE = /^(.+)-(\d{4})-(common|limited|rare|super_rare|unique)-(\d+)$/;

export function parseCardSlug(cardSlug: string) {
  const m = SLUG_RE.exec(cardSlug.trim());
  if (!m) return null;
  return { playerSlug: m[1], season: Number(m[2]), rarity: m[3], serialNumber: Number(m[4]) };
}

/** CSV numbers arrive as plain strings; "N/A" and blanks mean "unknown". */
export function parseNumber(v: string | undefined): number | null {
  if (v == null) return null;
  const t = v.trim();
  if (!t || t.toUpperCase() === "N/A") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const POSITIONS: Record<string, string> = {
  goalkeeper: "Goalkeeper",
  defender: "Defender",
  midfielder: "Midfielder",
  forward: "Forward",
};

export type GalleryRow = {
  cardSlug: string;
  playerSlug: string;
  displayName: string;
  position: string;
  age: number | null;
  season: number;
  rarity: string;
  serialNumber: number;
  inSeason: boolean;
  l10: number | null;
  price: number | null;
  floorPrice: number | null;
  estimatedPrice: number | null;
  boughtPrice: number | null;
};

export type ParsedGallery = { rows: GalleryRow[]; skipped: string[] };

export function parseGalleryCsv(text: string): ParsedGallery {
  const table = parseCsv(text);
  if (table.length < 2) throw new Error("CSV vide ou illisible.");

  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iSlug = col("card slug");
  const iName = col("player name");
  if (iSlug === -1 || iName === -1) {
    throw new Error(
      'Colonnes "Card Slug" et "Player Name" introuvables — est-ce bien un export "my gallery" de SorareScore ?'
    );
  }
  const iInSeason = col("in season");
  const iPosition = col("position");
  const iAge = col("age");
  const iL10 = col("l10");
  const iPrice = col("price");
  const iFloor = col("floor price");
  const iEstimated = col("estimated price");
  const iBought = col("bought price");

  const rows: GalleryRow[] = [];
  const skipped: string[] = [];

  for (const r of table.slice(1)) {
    const cardSlug = r[iSlug]?.trim();
    if (!cardSlug) continue;

    const parsed = parseCardSlug(cardSlug);
    if (!parsed) {
      skipped.push(cardSlug);
      continue;
    }

    rows.push({
      cardSlug,
      playerSlug: parsed.playerSlug,
      displayName: r[iName]?.trim() || parsed.playerSlug,
      position: POSITIONS[(r[iPosition] ?? "").trim().toLowerCase()] ?? "Midfielder",
      age: parseNumber(r[iAge]),
      season: parsed.season,
      rarity: parsed.rarity,
      serialNumber: parsed.serialNumber,
      inSeason: (r[iInSeason] ?? "").trim().toLowerCase() === "yes",
      l10: parseNumber(r[iL10]),
      price: parseNumber(r[iPrice]),
      floorPrice: parseNumber(r[iFloor]),
      estimatedPrice: parseNumber(r[iEstimated]),
      boughtPrice: parseNumber(r[iBought]),
    });
  }

  return { rows, skipped };
}
