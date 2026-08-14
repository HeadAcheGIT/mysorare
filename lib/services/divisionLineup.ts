import { prisma } from "../prisma";
import { graphql } from "../sorare/client";
import { DIVISION_BENCH, PREVIEW_LINEUP, CARDS_IN_LINEUPS } from "../sorare/queries";
import { optimise, type Candidate, type Rules } from "./optimizer";

/**
 * The line-up engine for one real division.
 *
 * Everything here hangs off Sorare's own compose bench (`myBench`), which is
 * the list of cards from this gallery that are actually eligible for that
 * division. That matters: the previous approach filtered the whole gallery
 * against four hand-written competitions in lib/services/rules.ts, so a
 * "possible line-up" was a guess about a competition that might not even
 * exist on the account.
 *
 * Validity is likewise not re-derived: `previewSo5Lineup` returns Sorare's own
 * rule-by-rule verdict on a proposed line-up. rules.ts survives only as the
 * shape fed to the LP solver (five cards, one per position, a captain).
 */

export interface BenchCard {
  benchObjectId: string;
  cardSlug: string | null;
  playerSlug: string;
  playerName: string;
  position: string;
  rarity: string;
  bonus: number;
  /** Sorare's projection for THIS division — not the same number as its generic one. */
  sorareProjected: number | null;
  /** Already committed to another line-up this game week, so not actually pickable. */
  locked: boolean;
  /** Our own model, joined from Projection. */
  ourExpected: number | null;
  ourPStart: number | null;
  sorareStarterOdds: number | null;
}

type BenchNode = {
  id: string;
  position: string | null;
  positions: string[] | null;
  rarity: string | null;
  bonus: number | null;
  projectedScore: number | null;
  lockedForLeaderboard: boolean | null;
  anyPlayer: { slug: string; displayName: string | null } | null;
  anyCard?: { slug: string } | null;
};

/**
 * So5 is a five-card game with one of each outfield line plus a free slot.
 * Deliberately permissive: the bench is already filtered by Sorare, and
 * `previewSo5Lineup` is the authority on whether a pick is legal — this only
 * has to be a good enough shape for the solver to optimise within.
 */
export const SO5_SHAPE: Rules = {
  name: "so5",
  displayName: "So5",
  size: 5,
  rarities: [],
  positionsMin: { Goalkeeper: 1, Defender: 1, Midfielder: 1, Forward: 1 },
  positionsMax: { Goalkeeper: 1, Defender: 3, Midfielder: 3, Forward: 3 },
  maxPerClub: null,
  minInSeason: 0,
  l15Cap: null,
  captainMultiplier: 1.2,
  allowCaptain: true,
  minPStart: 0,
};

/**
 * Turns bench rows into solver candidates.
 *
 * `expected` prefers our own projection and falls back to Sorare's for this
 * division — a card the local model has never scored (never enriched, just
 * bought) would otherwise be valued at 0 and never picked, which reads as
 * "your best card isn't worth fielding".
 *
 * Locked cards are dropped outright rather than scored low: they cannot be
 * selected at all, and leaving them in would let the solver build a line-up
 * that can't be entered.
 */
export function toCandidates(bench: BenchCard[]): Candidate[] {
  return bench
    .filter((b) => !b.locked && b.cardSlug)
    .map((b) => ({
      cardSlug: b.cardSlug as string,
      playerSlug: b.playerSlug,
      playerName: b.playerName,
      position: b.position,
      rarity: b.rarity,
      clubSlug: null,
      inSeason: false,
      expected: b.ourExpected ?? b.sorareProjected ?? 0,
      pStart: b.ourPStart ?? 0,
      l15: null,
      bonus: b.bonus,
    }));
}

export interface LineupDelta {
  /** Projected total of what's currently fielded, null when nothing is. */
  currentTotal: number | null;
  proposedTotal: number;
  /** proposed - current, null without a current line-up to compare against. */
  gain: number | null;
  /** Cards in the proposal that aren't in the current line-up. */
  cardsIn: string[];
  /** Cards currently fielded that the proposal drops. */
  cardsOut: string[];
}

/** What changing to the proposed line-up would actually do — the "should I adjust?" answer. */
export function computeDelta(
  currentCards: { cardSlug: string; expected: number | null }[],
  proposed: { cardSlug: string }[],
  proposedTotal: number
): LineupDelta {
  const currentSlugs = new Set(currentCards.map((c) => c.cardSlug));
  const proposedSlugs = new Set(proposed.map((c) => c.cardSlug));

  // A current line-up whose cards have no projection at all can't be scored;
  // reporting 0 would invent a gain equal to the whole proposal.
  const scored = currentCards.filter((c) => c.expected != null);
  const currentTotal = currentCards.length && scored.length ? round(scored.reduce((s, c) => s + (c.expected ?? 0), 0)) : null;

  return {
    currentTotal,
    proposedTotal: round(proposedTotal),
    gain: currentTotal == null ? null : round(proposedTotal - currentTotal),
    cardsIn: [...proposedSlugs].filter((s) => !currentSlugs.has(s)),
    cardsOut: [...currentSlugs].filter((s) => !proposedSlugs.has(s)),
  };
}

/**
 * Reward per projected point — the ROI reading that decides where a limited
 * set of cards is best spent. Null rather than Infinity when there's nothing
 * to divide by, so a division with no projection can't top the ranking.
 */
export function roiScore(prizePool: number | null, projectedTotal: number | null): number | null {
  if (prizePool == null || projectedTotal == null || projectedTotal <= 0) return null;
  return round(prizePool / projectedTotal, 3);
}

function round(v: number, dp = 2) {
  const m = 10 ** dp;
  return Math.round(v * m) / m;
}

/** The real eligible pool for one division, joined with our own projections. */
export async function getDivisionBench(leaderboardSlug: string, fixtureSlug: string): Promise<BenchCard[]> {
  const data = await graphql<{
    so5: { so5Leaderboard: { myBench: { nodes: BenchNode[] } | null } | null };
  }>(DIVISION_BENCH, { lb: leaderboardSlug });

  const nodes = data?.so5?.so5Leaderboard?.myBench?.nodes ?? [];
  if (!nodes.length) return [];

  const playerSlugs = [...new Set(nodes.map((n) => n.anyPlayer?.slug).filter((s): s is string => !!s))];
  const projections = await prisma.projection.findMany({
    where: { fixtureSlug, playerSlug: { in: playerSlugs } },
  });
  const projByPlayer = new Map(projections.map((p) => [p.playerSlug, p]));

  return nodes
    .filter((n) => n.anyPlayer?.slug)
    .map((n) => {
      const proj = projByPlayer.get(n.anyPlayer!.slug);
      return {
        benchObjectId: n.id,
        cardSlug: n.anyCard?.slug ?? null,
        playerSlug: n.anyPlayer!.slug,
        playerName: n.anyPlayer!.displayName ?? n.anyPlayer!.slug,
        position: n.position ?? n.positions?.[0] ?? "Midfielder",
        rarity: n.rarity ?? "limited",
        bonus: n.bonus ?? 0,
        sorareProjected: n.projectedScore ?? null,
        locked: Boolean(n.lockedForLeaderboard),
        ourExpected: proj?.expectedScore ?? null,
        ourPStart: proj?.pStart ?? null,
        sorareStarterOdds: proj?.sorareStarterOdds ?? null,
      };
    });
}

export interface RuleFeedback {
  ruleName: string;
  state: string;
  message: string | null;
}

/** Sorare's own verdict on a proposed line-up — the authority on validity. */
export async function validateLineup(
  leaderboardSlug: string,
  cardSlugs: string[],
  captainSlug: string | null
): Promise<{ rewardMultiplier: number | null; feedbackRules: RuleFeedback[] } | null> {
  if (!cardSlugs.length) return null;

  const appearances = cardSlugs.map((cardSlug, index) => ({
    cardSlug,
    captain: cardSlug === captainSlug,
    index,
  }));

  const data = await graphql<{
    so5: {
      so5Leaderboard: {
        previewSo5Lineup: { rewardMultiplier: number | null; feedbackRules: RuleFeedback[] | null } | null;
      } | null;
    };
  }>(PREVIEW_LINEUP, { lb: leaderboardSlug, appearances });

  const preview = data?.so5?.so5Leaderboard?.previewSo5Lineup;
  if (!preview) return null;
  return { rewardMultiplier: preview.rewardMultiplier ?? null, feedbackRules: preview.feedbackRules ?? [] };
}

export interface DivisionProposal {
  leaderboardSlug: string;
  bench: BenchCard[];
  /** Cards on the bench that are already committed elsewhere. */
  lockedCount: number;
  proposal: {
    cards: (Candidate & { isCaptain: boolean })[];
    captain: string | null;
    total: number;
  } | null;
  infeasibleReason: string | null;
  delta: LineupDelta | null;
  validation: { rewardMultiplier: number | null; feedbackRules: RuleFeedback[] } | null;
}

/**
 * The full answer for one division: what can be fielded, what the best
 * available line-up is, what changing to it would gain, and whether Sorare
 * accepts it.
 *
 * `validate` is opt-in because it costs an extra authenticated round trip;
 * the caller skips it when only the bench is wanted.
 */
export async function proposeForDivision(
  leaderboardSlug: string,
  fixtureSlug: string,
  opts: { locked?: string[]; banned?: string[]; validate?: boolean } = {}
): Promise<DivisionProposal> {
  const bench = await getDivisionBench(leaderboardSlug, fixtureSlug);
  const lockedCount = bench.filter((b) => b.locked).length;

  const candidates = toCandidates(bench);
  const solution = optimise(candidates, SO5_SHAPE, opts.locked ?? [], opts.banned ?? []);

  if (solution.infeasibleReason) {
    return {
      leaderboardSlug,
      bench,
      lockedCount,
      proposal: null,
      infeasibleReason: solution.infeasibleReason,
      delta: null,
      validation: null,
    };
  }

  const current = await prisma.alignedLineup.findMany({
    where: { fixtureSlug, leaderboardSlug },
  });
  const currentProjections = await prisma.projection.findMany({
    where: { fixtureSlug, playerSlug: { in: current.map((c) => c.playerSlug) } },
  });
  const expectedByPlayer = new Map(currentProjections.map((p) => [p.playerSlug, p.expectedScore]));

  const delta = computeDelta(
    current.map((c) => ({ cardSlug: c.cardSlug, expected: expectedByPlayer.get(c.playerSlug) ?? null })),
    solution.cards,
    solution.total
  );

  let validation: DivisionProposal["validation"] = null;
  if (opts.validate) {
    // Never fatal: a rejected or unavailable preview shouldn't withhold the
    // suggestion itself, it just leaves it unconfirmed.
    validation = await validateLineup(
      leaderboardSlug,
      solution.cards.map((c) => c.cardSlug),
      solution.captain
    ).catch(() => null);
  }

  return {
    leaderboardSlug,
    bench,
    lockedCount,
    proposal: { cards: solution.cards, captain: solution.captain, total: solution.total },
    infeasibleReason: null,
    delta,
    validation,
  };
}

/** Card slugs already engaged in a live or upcoming line-up, for the gallery's "en compo" flag. */
export async function cardsInLineups(): Promise<Set<string>> {
  const data = await graphql<{ currentUser: { blockchainCardsInLineups: string[] } | null }>(CARDS_IN_LINEUPS);
  return new Set(data?.currentUser?.blockchainCardsInLineups ?? []);
}
