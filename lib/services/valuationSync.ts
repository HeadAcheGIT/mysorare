import { config } from "../config";
import { prisma } from "../prisma";
import { getPlayerValuation } from "./market";
import { staleTargets, type Holding } from "../valuationTargets";

/**
 * Keeps a market value on every card in the gallery.
 *
 * Before this, `Card.price` / `floorPrice` / `estimatedPrice` came only from a
 * SorareScore CSV export, so an API-synced gallery had no prices at all and an
 * imported one carried whatever the export said on the day — an any-season
 * floor that read 0,33 € for a card trading at ~5 € in-season. Everything
 * downstream inherited that: the gallery, the insights, the season report and
 * the division advisor each valued cards from it.
 *
 * The valuation itself is `lib/valuation.ts` on completed sales. What this adds
 * is persistence, because a valuation costs one un-batchable Sorare request
 * and a 200-card gallery can't spend that on every page load.
 */

/**
 * How many markets one invocation refreshes.
 *
 * The public API paces at ~3.2 s per request, so 15 fills roughly 48 s of a
 * 60 s serverless budget and leaves headroom. With an API key the pacing drops
 * to ~0.12 s and the whole gallery usually fits in one call.
 */
const BATCH = () => (config.sorareApiKey ? 250 : 15);

export interface ValuationSyncProgress {
  /** Markets revalued in this call. */
  processed: number;
  /** Markets still stale after it — the caller loops while this is above zero. */
  remaining: number;
  /** Distinct markets held, so the UI can show progress against a total. */
  total: number;
  /** Markets that errored, kept separate from ones that simply had no sales. */
  failed: number;
}

/** Every market the gallery actually holds, one entry per player+rarity+eligibility. */
async function holdings(): Promise<Holding[]> {
  const cards = await prisma.card.findMany({
    select: { playerSlug: true, rarity: true, inSeason: true },
  });
  return cards.map((c) => ({
    playerSlug: c.playerSlug,
    rarity: c.rarity,
    inSeason: c.inSeason,
  }));
}

export async function syncValuationsBatch(): Promise<ValuationSyncProgress> {
  const held = await holdings();
  const cached = await prisma.playerValuation.findMany({
    select: { playerSlug: true, rarity: true, inSeason: true, computedAt: true },
  });

  const stale = staleTargets(held, cached);
  const slice = stale.slice(0, BATCH());

  let failed = 0;

  for (const target of slice) {
    try {
      const v = await getPlayerValuation(target.playerSlug, target.rarity, target.inSeason);
      const row = {
        value: v.value,
        low: v.low,
        high: v.high,
        sampleSize: v.sampleSize,
        totalSales: v.totalSales,
        windowDays: v.windowDays,
        daysSinceLast: v.daysSinceLast,
        trendPct: v.trendPct,
        launchPremium: v.launchPremium,
        thin: v.thin,
        // Stamped even when there were no sales: "we looked and found nothing"
        // is an answer, and without it every empty market would be retried on
        // every pass and starve the ones that do have prices.
        computedAt: new Date(),
      };
      await prisma.playerValuation.upsert({
        where: {
          playerSlug_rarity_inSeason: {
            playerSlug: target.playerSlug,
            rarity: target.rarity,
            inSeason: target.inSeason,
          },
        },
        create: { ...target, ...row },
        update: row,
      });
    } catch (err) {
      failed++;
      await prisma.syncLog.create({
        data: {
          job: "valuations",
          status: "error",
          detail: `${target.playerSlug} ${target.rarity}: ${(err as Error).message}`.slice(0, 2000),
        },
      });
    }
  }

  const remaining = Math.max(stale.length - slice.length, 0);
  if (remaining === 0) {
    await prisma.syncLog.create({
      data: {
        job: "valuations",
        status: "ok",
        detail: `completed, ${slice.length} marchés revalorisés`,
      },
    });
  }

  return {
    processed: slice.length,
    remaining,
    // Distinct markets held, which is the denominator the UI shows progress against.
    total: new Set(held.map((h) => `${h.playerSlug}:${h.rarity}:${h.inSeason}`)).size,
    failed,
  };
}
