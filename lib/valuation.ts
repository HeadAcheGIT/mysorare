/**
 * What a card is actually worth, from completed sales rather than listings.
 *
 * The previous answer was `lowestPriceAnyCard(...).liveSingleSaleOffer` — the
 * cheapest *asking price*. Checked against Maxime Lopez's real in-season
 * market: that listing said 14,90 € while the fifteen most recent completed
 * sales ran 6,38 € to 30,15 € with a median of 10,81 €, and were falling hard
 * (30 € on 10 Aug, ~8 € on 12 Aug). An asking price is one seller's hope; it
 * is not evidence of value, and using it overstated the card by ~40%.
 *
 * So: value from transactions, weight recent ones more, use the median so a
 * single outlier can't move it, and always publish the spread and the sample
 * size so the number can be judged rather than trusted blindly.
 *
 * Pure and free of server imports so both the API layer and the client can use it.
 */

export interface Sale {
  /** ISO date of the completed sale. */
  date: string;
  /** Price in EUR. Sales priced in another currency must be filtered out by the caller. */
  eur: number;
}

export interface Valuation {
  /** Recency-weighted median of recent sales — the headline figure. */
  value: number | null;
  /** Cheapest and dearest of the sample, so the spread is visible. */
  low: number | null;
  high: number | null;
  /** How many sales back it, so a value built on two trades reads as such. */
  sampleSize: number;
  /** Days since the most recent sale — a month-old market is not today's. */
  daysSinceLast: number | null;
  /** % move of the recent half against the older half. Negative means falling. */
  trendPct: number | null;
  /** True when too few or too old to lean on. */
  thin: boolean;
}

/** Sales more than this old say more about last month's market than today's. */
export const STALE_SALE_DAYS = 21;
/** Below this many sales, a median is barely better than a guess. */
export const THIN_SAMPLE = 4;
/** A sale this many days old counts half as much as one from today. */
const HALFLIFE_DAYS = 5;

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Median of values carrying weights.
 *
 * Weighted rather than plain so that a burst of cheap sales today outweighs
 * last week's expensive ones, and median rather than mean so a single 30 €
 * outlier among 8 € trades doesn't drag the answer up.
 */
export function weightedMedian(pairs: { value: number; weight: number }[]): number | null {
  const usable = pairs.filter((p) => p.weight > 0);
  if (!usable.length) return null;

  const sorted = [...usable].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((s, p) => s + p.weight, 0);

  let cumulative = 0;
  for (const p of sorted) {
    cumulative += p.weight;
    if (cumulative >= total / 2) return p.value;
  }
  return sorted[sorted.length - 1].value;
}

/**
 * Values a card from its completed sales.
 *
 * `now` is injectable so the recency maths is testable rather than dependent
 * on the clock.
 */
export function valueFromSales(sales: Sale[], now: Date = new Date()): Valuation {
  const clean = sales
    .filter((s) => Number.isFinite(s.eur) && s.eur > 0)
    .map((s) => ({ ...s, ts: Date.parse(s.date) }))
    .filter((s) => Number.isFinite(s.ts))
    // Newest first, enforced here rather than trusted from the caller — the
    // API returns these oldest-first.
    .sort((a, b) => b.ts - a.ts);

  if (!clean.length) {
    return {
      value: null,
      low: null,
      high: null,
      sampleSize: 0,
      daysSinceLast: null,
      trendPct: null,
      thin: true,
    };
  }

  const daysSinceLast = Math.floor((now.getTime() - clean[0].ts) / 86_400_000);

  const weighted = clean.map((s) => {
    const ageDays = Math.max(0, (now.getTime() - s.ts) / 86_400_000);
    return { value: s.eur, weight: Math.pow(0.5, ageDays / HALFLIFE_DAYS) };
  });

  const values = clean.map((s) => s.eur);

  // Recent half against older half. Needs enough sales that each half means
  // something, otherwise it reports noise as a trend.
  let trendPct: number | null = null;
  if (clean.length >= THIN_SAMPLE) {
    const half = Math.floor(clean.length / 2);
    const recent = values.slice(0, half);
    const older = values.slice(half);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const olderAvg = avg(older);
    if (olderAvg > 0) trendPct = round(((avg(recent) - olderAvg) / olderAvg) * 100);
  }

  const value = weightedMedian(weighted);

  return {
    value: value != null ? round(value) : null,
    low: round(Math.min(...values)),
    high: round(Math.max(...values)),
    sampleSize: clean.length,
    daysSinceLast,
    trendPct,
    thin: clean.length < THIN_SAMPLE || daysSinceLast > STALE_SALE_DAYS,
  };
}

/**
 * How far a live asking price sits above or below what cards actually sell
 * for. Positive means the seller is asking more than the market has paid.
 *
 * This is the check that would have caught the original mistake: the 14,90 €
 * listing was +38% over a 10,81 € market.
 */
export function listingPremiumPct(listing: number | null, value: number | null): number | null {
  if (listing == null || value == null || value <= 0) return null;
  return round(((listing - value) / value) * 100);
}
