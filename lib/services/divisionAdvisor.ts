import { prisma } from "../prisma";
import { listDivisions, getFunds, type DivisionView, type EligibilityRow } from "./divisions";

/**
 * "Sur quelle division in-season me lancer ?" — ranked from what the account
 * actually has, what each division is short of, and what closing that gap
 * would plausibly cost.
 *
 * The eligibility side is fact, not inference: `canCompose`, `missingCards`,
 * `missingPositions` and `missingAnyRarities` are Sorare's own verdict, synced
 * in lib/services/divisions.ts. The money side is the opposite — no API gives
 * "cheapest in-season defender at limited", so the cost figure here is a
 * median over sampled market data and is labelled an estimate everywhere it
 * surfaces. The two are deliberately kept separate: a wrong price should never
 * make an eligibility answer look wrong.
 */

export type OpportunityStatus =
  | "lineup_in" // already fielded here this game week
  | "ready" // eligible, nothing missing
  | "close" // short by a card or two
  | "far" // short by more
  | "locked"; // Sorare says you can't enter at all

export interface MarketSample {
  position: string;
  rarity: string;
  /** In-season floor for one listed card, in EUR. */
  inSeasonFloorEur: number;
}

export interface CostEstimate {
  /** Median in-season floor summed across the missing slots — an order of magnitude, never a quote. */
  total: number | null;
  perPosition: { position: string; eur: number | null; sampleSize: number }[];
}

/** Median rather than min: the cheapest listing is usually an outlier nobody would field. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * What the missing slots would plausibly cost, from sampled in-season floors.
 * A position with no sample returns null rather than a guess, and the total is
 * null as soon as any slot is unpriced — a partial sum would read as a
 * complete budget and understate the real cost.
 */
export function estimateGapCost(
  missingPositions: string[],
  rarity: string | null,
  samples: MarketSample[]
): CostEstimate {
  if (!missingPositions.length) return { total: 0, perPosition: [] };

  const perPosition = missingPositions.map((position) => {
    const matching = samples.filter(
      (s) => s.position === position && (rarity == null || s.rarity === rarity)
    );
    return {
      position,
      eur: median(matching.map((s) => s.inSeasonFloorEur)),
      sampleSize: matching.length,
    };
  });

  const total = perPosition.some((p) => p.eur == null)
    ? null
    : perPosition.reduce((sum, p) => sum + (p.eur ?? 0), 0);

  return { total, perPosition };
}

/**
 * Price samples from the in-season cards already valued in the gallery
 * (SorareScore's `floorPrice`, see lib/services/csvImport.ts).
 *
 * The alternative was scouting the live market per position and rarity, which
 * is one paced public-API round trip per league — tens of seconds before the
 * screen could show anything. These valuations are already local and free.
 *
 * The trade-off is real and the UI says so: this is what in-season cards at
 * that position and rarity are worth *in your gallery*, which skews toward
 * what you already chose to buy. It sizes a decision; it doesn't quote a
 * purchase.
 */
export async function marketSamplesFromGallery(): Promise<MarketSample[]> {
  const cards = await prisma.card.findMany({
    where: { inSeason: true, floorPrice: { not: null } },
    select: { rarity: true, floorPrice: true, player: { select: { position: true } } },
  });

  return cards
    .filter((c) => c.floorPrice != null && c.floorPrice > 0)
    .map((c) => ({
      position: c.player.position,
      rarity: c.rarity,
      inSeasonFloorEur: c.floorPrice as number,
    }));
}

export interface OpportunityInput {
  divisionSlug: string;
  displayName: string;
  trackName: string;
  division: number | null;
  rarityType: string | null;
  seasonality: string | null;
  canCompose: boolean;
  canComposeReason: string | null;
  missingCards: number;
  missingPositions: string[];
  missingRarities: string[];
  notEnoughEligibleCards: boolean;
  prizePool: number | null;
  prizePoolCurrency: string | null;
  hasLineup: boolean;
  eligibility: EligibilityRow[];
  transferMarketFilters: string | null;
  cutOffDate: string | null;
}

export interface Opportunity extends OpportunityInput {
  status: OpportunityStatus;
  label: string;
  cost: CostEstimate | null;
  /** null when either the budget or the cost is unknown — never guessed. */
  affordable: boolean | null;
  score: number;
}

/** Short by this many cards or fewer still counts as within reach. */
const CLOSE_THRESHOLD = 2;

export function statusOf(input: Pick<OpportunityInput, "hasLineup" | "canCompose" | "missingCards" | "notEnoughEligibleCards">): OpportunityStatus {
  if (input.hasLineup) return "lineup_in";
  if (input.canCompose) return "ready";
  // Sorare says no and doesn't attribute it to a card shortfall — an entry
  // requirement, a locked track. Buying cards wouldn't change it.
  if (!input.notEnoughEligibleCards && input.missingCards === 0) return "locked";
  return input.missingCards <= CLOSE_THRESHOLD ? "close" : "far";
}

const eur = (v: number) => `${v.toFixed(0)} €`;

export function labelFor(status: OpportunityStatus, input: OpportunityInput, cost: CostEstimate | null): string {
  switch (status) {
    case "lineup_in":
      return "Compo déjà alignée";
    case "ready":
      return "Prêt à jouer — tu as les cartes";
    case "locked":
      return input.canComposeReason ?? "Non accessible pour cette game week";
    case "close":
    case "far": {
      const cards = `${input.missingCards} carte${input.missingCards > 1 ? "s" : ""}`;
      const positions = input.missingPositions.length ? ` (${input.missingPositions.join(", ")})` : "";
      const price = cost?.total != null ? ` · ~${eur(cost.total)}` : "";
      return `Il te manque ${cards}${positions}${price}`;
    }
  }
}

/**
 * Ranks by how close the division is to playable, weighted by what it pays.
 * The prize pool is log-scaled on purpose: a pool ten times bigger is worth
 * more, but not ten times more, and without that a single huge pool would
 * bury every division you can actually enter today.
 */
export function scoreOpportunity(
  status: OpportunityStatus,
  input: OpportunityInput,
  affordable: boolean | null
): number {
  if (status === "locked") return 0;
  // Already fielded: still worth listing, never worth recommending as the
  // next move — it isn't a decision left to make.
  if (status === "lineup_in") return 0.01;

  const readiness = input.canCompose ? 1 : 1 / (1 + input.missingCards);
  const reward = 1 + Math.log10(1 + Math.max(0, input.prizePool ?? 0));
  // Out of budget isn't disqualifying — it's a target to save toward — but it
  // shouldn't outrank something playable now.
  const affordability = affordable === false ? 0.3 : 1;

  return readiness * reward * affordability;
}

export function buildOpportunity(
  input: OpportunityInput,
  samples: MarketSample[],
  budgetEur: number | null
): Opportunity {
  const status = statusOf(input);
  const needsCost = status === "close" || status === "far";
  const cost = needsCost ? estimateGapCost(input.missingPositions, input.rarityType, samples) : null;
  const affordable = cost?.total == null || budgetEur == null ? null : cost.total <= budgetEur;

  return {
    ...input,
    status,
    cost,
    affordable,
    label: labelFor(status, input, cost),
    score: scoreOpportunity(status, input, affordable),
  };
}

function toInput(track: { displayName: string }, d: DivisionView): OpportunityInput {
  return {
    divisionSlug: d.slug,
    displayName: d.displayName,
    trackName: track.displayName,
    division: d.division,
    rarityType: d.rarityType,
    seasonality: d.seasonality,
    canCompose: d.canCompose,
    canComposeReason: d.canComposeReason,
    missingCards: d.missingCards,
    missingPositions: d.missingPositions,
    missingRarities: d.missingRarities,
    notEnoughEligibleCards: d.notEnoughEligibleCards,
    prizePool: d.prizePool,
    prizePoolCurrency: d.prizePoolCurrency,
    hasLineup: d.hasLineup,
    eligibility: d.eligibility,
    transferMarketFilters: d.transferMarketFilters,
    cutOffDate: d.cutOffDate,
  };
}

export interface AdvisorResult {
  fixture: string;
  budgetEur: number | null;
  budgetSource: "sorare" | "manual" | "unknown";
  opportunities: Opportunity[];
  /** True when no market sample was available, so every cost reads as unknown. */
  costUnavailable: boolean;
}

/**
 * In-season divisions only — that's the question being asked. Classic tracks
 * are still visible on the board itself, they're just not what this ranks.
 */
export async function buildAdvice(
  fixtureSlug: string,
  opts: { budgetOverrideEur?: number | null; samples?: MarketSample[] } = {}
): Promise<AdvisorResult> {
  const tracks = await listDivisions(fixtureSlug);
  const samples = opts.samples ?? (await marketSamplesFromGallery().catch(() => []));

  let budgetEur = opts.budgetOverrideEur ?? null;
  let budgetSource: AdvisorResult["budgetSource"] = budgetEur != null ? "manual" : "unknown";
  if (budgetEur == null) {
    // A missing or expired Sorare session shouldn't take the whole advisor
    // down — it just means the affordability column stays unknown.
    const funds = await getFunds().catch(() => null);
    if (funds?.totalEur != null) {
      budgetEur = funds.totalEur;
      budgetSource = "sorare";
    }
  }

  const opportunities = tracks
    .filter((t) => t.seasonality === "IN_SEASON")
    .flatMap((t) => t.divisions.map((d) => buildOpportunity(toInput(t, d), samples, budgetEur)))
    .sort((a, b) => b.score - a.score);

  return {
    fixture: fixtureSlug,
    budgetEur,
    budgetSource,
    opportunities,
    costUnavailable: samples.length === 0,
  };
}
