import { prisma } from "../prisma";
import { getPlayerMarket } from "./market";
import { searchPlayerNews } from "./news";

/**
 * Two standing signals worth a badge on a card: the live floor price moving
 * meaningfully since the last check, and a transfer-flavoured headline in
 * recent news. Both only run for players actually owned or watchlisted — a
 * bounded, small set — never the whole market:
 *  - Price checks reuse the public API's own pacing (see publicClient.ts).
 *  - News checks reuse Google News' RSS search (see news.ts), which that
 *    file's own comments call a courtesy feed to be used "never in bulk" —
 *    so this runs at most once/day from the cron job, sequentially, with a
 *    deliberate delay between calls, not on every page load.
 */

const PRICE_MOVE_THRESHOLD = 0.1; // 10%
const NEWS_DELAY_MS = 1500;
export const TRANSFER_KEYWORDS =
  /\b(transfert|mercato|transfer|signe|signs|quitte|quitter|leaves|s'engage|prêt(?:é)?|loan|rejoin[dt]|part(?:ir)?|deal|move to|vers le [A-Z]|move away)\b/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pure: does any headline read as transfer-flavoured? Split out for unit testing. */
export function findTransferHeadline<T extends { title: string }>(items: T[]): T | null {
  return items.find((n) => TRANSFER_KEYWORDS.test(n.title)) ?? null;
}

interface TrackedPlayer {
  slug: string;
  name: string;
  /// Representative rarity for the price check. Owned cards use their real
  /// rarity; watchlist entries don't carry one, so "limited" stands in as
  /// the mid-market reference — same default the scouting tab uses.
  rarity: string;
}

async function trackedPlayers(): Promise<TrackedPlayer[]> {
  const [cards, watchlist, lastChecks] = await Promise.all([
    prisma.card.findMany({ select: { playerSlug: true, rarity: true, player: { select: { displayName: true } } } }),
    prisma.watchlistItem.findMany({ select: { playerSlug: true, label: true } }),
    // When each player was last looked at. PriceSnapshot is written on every
    // check, so it doubles as the "last seen" record and no extra column is
    // needed to rotate the list.
    prisma.priceSnapshot.groupBy({ by: ["playerSlug"], _max: { capturedAt: true } }),
  ]);

  const bySlug = new Map<string, TrackedPlayer>();
  for (const c of cards) {
    if (!bySlug.has(c.playerSlug)) {
      bySlug.set(c.playerSlug, { slug: c.playerSlug, name: c.player.displayName, rarity: c.rarity });
    }
  }
  for (const w of watchlist) {
    if (!bySlug.has(w.playerSlug)) {
      bySlug.set(w.playerSlug, { slug: w.playerSlug, name: w.label, rarity: "limited" });
    }
  }

  // Stalest first, never-checked before that. A run only gets through as many
  // players as its time budget allows, and walking the list in a fixed order
  // meant the same opening handful was re-checked every single day while the
  // tail was never checked at all.
  const lastSeen = new Map(lastChecks.map((r) => [r.playerSlug, r._max.capturedAt?.getTime() ?? 0]));
  return [...bySlug.values()].sort(
    (a, b) => (lastSeen.get(a.slug) ?? 0) - (lastSeen.get(b.slug) ?? 0) || a.slug.localeCompare(b.slug)
  );
}

async function upsertOrClearAlert(playerSlug: string, kind: string, detail: string | null) {
  if (detail == null) {
    await prisma.playerAlert.deleteMany({ where: { playerSlug, kind } });
    return;
  }
  await prisma.playerAlert.upsert({
    where: { playerSlug_kind: { playerSlug, kind } },
    create: { playerSlug, kind, detail },
    update: { detail, createdAt: new Date() },
  });
}

export type PriceClassification = { kind: "price_up" | "price_down" | null; detail: string | null };

/**
 * Pure decision: given a previous and current floor, which alert (if any)
 * should stand. Split out from checkPriceAlert so the threshold logic is
 * unit-testable without a database.
 */
export function classifyPriceChange(
  previousFloor: number | null | undefined,
  currentFloor: number,
  threshold = PRICE_MOVE_THRESHOLD
): PriceClassification {
  if (previousFloor == null || previousFloor <= 0) return { kind: null, detail: null };
  const change = (currentFloor - previousFloor) / previousFloor;

  if (change <= -threshold) {
    return { kind: "price_down", detail: `${Math.round(change * 100)}% depuis la dernière vérification` };
  }
  if (change >= threshold) {
    return { kind: "price_up", detail: `+${Math.round(change * 100)}% depuis la dernière vérification` };
  }
  return { kind: null, detail: null };
}

async function checkPriceAlert(p: TrackedPlayer): Promise<void> {
  // Only the rarity actually tracked: this used to fetch all five and discard
  // four, and it stays correct for a rarity outside the default shopping list.
  const market = await getPlayerMarket(p.slug, [p.rarity]);
  const floor = market.floorByRarity[p.rarity];
  if (floor == null) return;

  const previous = await prisma.priceSnapshot.findFirst({
    where: { playerSlug: p.slug, rarity: p.rarity },
    orderBy: { capturedAt: "desc" },
  });

  await prisma.priceSnapshot.create({ data: { playerSlug: p.slug, rarity: p.rarity, floorPrice: floor } });

  if (!previous) return;
  const { kind, detail } = classifyPriceChange(previous.floorPrice, floor);
  await upsertOrClearAlert(p.slug, "price_down", kind === "price_down" ? detail : null);
  await upsertOrClearAlert(p.slug, "price_up", kind === "price_up" ? detail : null);
}

async function checkTransferAlert(p: TrackedPlayer): Promise<void> {
  const items = await searchPlayerNews(`${p.name} transfert`, 5);
  const hit = findTransferHeadline(items);
  await upsertOrClearAlert(p.slug, "transfer_rumor", hit ? hit.title : null);
}

export interface AlertsProgress {
  priceChecked: number;
  newsChecked: number;
}

/**
 * Runs both checks for whichever tracked players are due, bounded by a time
 * budget so it fits inside the daily cron invocation alongside enrichment —
 * staleness-first, so an interrupted run picks up where it left off next time
 * rather than needing a cursor.
 *
 * Both checks happen in the same pass over the same player. They used to be
 * two full loops sharing one budget, and the price loop is the slow one: at
 * the public API's unaccredited pacing it is ~3 s per player, so on a real
 * gallery it consumed the whole 50 s and the news loop below it ran for
 * exactly zero players. `transfer_rumor` alerts could never appear at all —
 * measured on a 17-player gallery: priceChecked 17, newsChecked 0.
 *
 * Interleaving costs price coverage per run and buys the news check its
 * existence back; the staleness ordering is what makes the reduced per-run
 * coverage acceptable, since the players skipped today are first tomorrow.
 */
export async function runAlerts(budgetMs: number): Promise<AlertsProgress> {
  const started = Date.now();
  const players = await trackedPlayers();
  let priceChecked = 0;
  let newsChecked = 0;

  for (const p of players) {
    if (Date.now() - started > budgetMs) break;
    try {
      await checkPriceAlert(p);
      priceChecked++;
    } catch {
      // One player's market hiccup shouldn't stop the run.
    }

    try {
      await checkTransferAlert(p);
      newsChecked++;
    } catch {
      // Courtesy feed — a failure here is expected occasionally, not fatal.
    }
    await sleep(NEWS_DELAY_MS);
  }

  return { priceChecked, newsChecked };
}

export async function getAlertsBySlug(): Promise<Map<string, { kind: string; detail: string | null }[]>> {
  const rows = await prisma.playerAlert.findMany();
  const map = new Map<string, { kind: string; detail: string | null }[]>();
  for (const r of rows) {
    const list = map.get(r.playerSlug) ?? [];
    list.push({ kind: r.kind, detail: r.detail });
    map.set(r.playerSlug, list);
  }
  return map;
}
