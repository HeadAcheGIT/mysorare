/**
 * What a card is actually worth, from completed sales.
 *
 * Two corrections are baked in, both learned from real data rather than
 * assumed:
 *
 * 1. A listing is not a transaction. The first version read
 *    `lowestPriceAnyCard(...).liveSingleSaleOffer` — an asking price. On
 *    Maxime Lopez it said 14,90 € while cards were changing hands at ~5 €.
 *
 * 2. **New-season cards launch at a large premium.** Sorare releases serials
 *    in order and the first ones are bid up by scarcity hype, so an average
 *    over a season's whole history mostly measures the drop, not the market.
 *    Lopez 2026 limited, over five days:
 *
 *      serial 1  → 30,15 €      serials 22-28 → 3,44-5,03 €
 *      serials 2-3 → ~19 €      serials 29-35 → 4,05-6,83 €
 *      serials 4-6 → 11-13 €
 *
 *    A flat median of that history returns ~10 €, double the ~5 € the card
 *    actually trades at today. So the value is taken from the most recent
 *    window that holds enough sales, not from everything on record.
 *
 * Pure and free of server imports so both the API layer and the client can use it.
 */

export interface Sale {
  /** ISO date of the completed sale. */
  date: string;
  /** Price in EUR. Sales priced in another currency must be filtered out by the caller. */
  eur: number;
  /** Serial number of the card sold, when known — drives the launch-premium read. */
  serial?: number | null;
}

export interface Valuation {
  /** Recency-weighted median over the chosen window — the headline figure. */
  value: number | null;
  low: number | null;
  high: number | null;
  /** Sales actually used, after windowing and outlier removal. */
  sampleSize: number;
  /** Sales available before windowing, so a narrow window is visible. */
  totalSales: number;
  /** Width of the window used, in days. */
  windowDays: number | null;
  daysSinceLast: number | null;
  /** % move of the recent half against the older half, within the window. */
  trendPct: number | null;
  /**
   * True when early serials sold far above the current level — the card is
   * still in its launch phase and older prices are not a guide.
   */
  launchPremium: boolean;
  /** True when too few or too old to lean on. */
  thin: boolean;
}

/** Windows tried in order; the first with enough sales wins. */
const WINDOWS_DAYS = [2, 4, 7, 14, 30, 120];
/** Below this, a window is too sparse to be worth preferring over a wider one. */
const MIN_SALES = 5;
/** Below this in total, any answer is a guess. */
export const THIN_SAMPLE = 4;
/** Sales older than this say more about a past market than today's. */
export const STALE_SALE_DAYS = 21;
/** A sale this many days old counts half as much as one from today. */
const HALFLIFE_DAYS = 1;
/** Above this multiple of the window's median, a sale is treated as an outlier. */
const OUTLIER_FACTOR = 2.5;
/** Early serials priced this far above the recent level mean the drop is still settling. */
const LAUNCH_PREMIUM_FACTOR = 1.8;

const round = (v: number) => Math.round(v * 100) / 100;
const DAY_MS = 86_400_000;

/**
 * Median of values carrying weights.
 *
 * Weighted so today's trades outrank last week's, and median rather than mean
 * so one outlier can't drag the answer.
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

const plainMedian = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

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
    // Newest first, enforced here rather than trusted — the API returns these
    // oldest-first.
    .sort((a, b) => b.ts - a.ts);

  const empty: Valuation = {
    value: null,
    low: null,
    high: null,
    sampleSize: 0,
    totalSales: 0,
    windowDays: null,
    daysSinceLast: null,
    trendPct: null,
    launchPremium: false,
    thin: true,
  };
  if (!clean.length) return empty;

  const daysSinceLast = Math.floor((now.getTime() - clean[0].ts) / DAY_MS);

  // The narrowest window that still holds enough sales. A new season's early,
  // inflated prices fall outside it as soon as trading settles, which is what
  // stops them dominating the answer.
  let window = clean;
  let windowDays: number | null = null;
  for (const days of WINDOWS_DAYS) {
    const cut = now.getTime() - days * DAY_MS;
    const inWindow = clean.filter((s) => s.ts >= cut);
    if (inWindow.length >= MIN_SALES) {
      window = inWindow;
      windowDays = days;
      break;
    }
  }

  // One stray trade or a mispriced sale shouldn't move the median.
  const roughMedian = plainMedian(window.map((s) => s.eur));
  const kept = window.filter((s) => s.eur <= roughMedian * OUTLIER_FACTOR);
  const used = kept.length >= 3 ? kept : window;

  const value = weightedMedian(
    used.map((s) => ({
      value: s.eur,
      weight: Math.pow(0.5, Math.max(0, (now.getTime() - s.ts) / DAY_MS) / HALFLIFE_DAYS),
    }))
  );

  const values = used.map((s) => s.eur);

  let trendPct: number | null = null;
  if (used.length >= THIN_SAMPLE) {
    const half = Math.floor(used.length / 2);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const olderAvg = avg(values.slice(half));
    if (olderAvg > 0) trendPct = round(((avg(values.slice(0, half)) - olderAvg) / olderAvg) * 100);
  }

  // Launch premium: the lowest serials on record sold well above where the
  // card sits now. Worth saying out loud — it means the card is still finding
  // its level and any historical average overstates it.
  let launchPremium = false;
  const withSerial = clean.filter((s) => s.serial != null);
  if (value != null && withSerial.length >= MIN_SALES) {
    const bySerial = [...withSerial].sort((a, b) => (a.serial as number) - (b.serial as number));
    const earliest = bySerial.slice(0, Math.max(1, Math.floor(bySerial.length * 0.15)));
    const earliestMedian = plainMedian(earliest.map((s) => s.eur));
    launchPremium = earliestMedian > value * LAUNCH_PREMIUM_FACTOR;
  }

  return {
    value: value != null ? round(value) : null,
    low: round(Math.min(...values)),
    high: round(Math.max(...values)),
    sampleSize: used.length,
    totalSales: clean.length,
    windowDays,
    daysSinceLast,
    trendPct,
    launchPremium,
    thin: clean.length < THIN_SAMPLE || daysSinceLast > STALE_SALE_DAYS,
  };
}

/**
 * How far a live asking price sits above or below what cards actually sell
 * for. Positive means the seller is asking more than the market has paid.
 *
 * This is the check that catches the original mistake: a 14,90 € listing
 * against a ~5 € market is a 3x premium, not a valuation.
 */
export function listingPremiumPct(listing: number | null, value: number | null): number | null {
  if (listing == null || value == null || value <= 0) return null;
  return round(((listing - value) / value) * 100);
}
