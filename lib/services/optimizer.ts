/**
 * Line-up optimiser: picks the squad that maximises projected score under one
 * `Rules` shape. Its only caller is lib/services/divisionLineup.ts, which
 * hands it Sorare's own eligible bench for a real division (`SO5_SHAPE`,
 * defined there) — an earlier version of this file took its `Rules` from a
 * hand-written `lib/services/rules.ts`, guessing at competitions that might
 * not exist on the account; see DivisionBoard.tsx for why that was dropped.
 */
// @ts-ignore — no published types for javascript-lp-solver
import solver from "javascript-lp-solver";

export interface Candidate {
  cardSlug: string;
  playerSlug: string;
  playerName: string;
  position: string;
  rarity: string;
  clubSlug: string | null;
  inSeason: boolean;
  expected: number;
  pStart: number;
  l15: number | null;
  bonus: number;
  /** Optional: only the division board's pitch view needs it, so other callers (buy advice, debrief) simply omit it. */
  picture?: string | null;
}

export interface Rules {
  /** Internal key, also what /api/optimise expects back — never shown to a user. */
  name: string;
  /** What a manager actually reads in the competition picker. */
  displayName: string;
  size: number;
  rarities: string[];
  positionsMin: Record<string, number>;
  positionsMax: Record<string, number>;
  maxPerClub: number | null;
  minInSeason: number;
  l15Cap: number | null;
  captainMultiplier: number;
  allowCaptain: boolean;
  minPStart: number;
}

export interface Solution {
  cards: (Candidate & { isCaptain: boolean })[];
  captain: string | null;
  total: number;
  infeasibleReason: string | null;
}

export function optimise(
  candidates: Candidate[],
  rules: Rules,
  locked: string[] = [],
  banned: string[] = []
): Solution {
  const pool = candidates.filter(
    (c) =>
      rules.rarities.includes(c.rarity) &&
      !banned.includes(c.cardSlug) &&
      (c.pStart >= rules.minPStart || locked.includes(c.cardSlug))
  );

  if (pool.length < rules.size) {
    return {
      cards: [],
      captain: null,
      total: 0,
      infeasibleReason: `Only ${pool.length} eligible cards for a ${rules.size}-card line-up`,
    };
  }

  const model: Record<string, unknown> = {
    optimize: "score",
    opType: "max",
    constraints: {} as Record<string, { equal?: number; max?: number; min?: number }>,
    variables: {} as Record<string, Record<string, number>>,
    binaries: {} as Record<string, number>,
  };
  const constraints = model.constraints as Record<string, { equal?: number; max?: number; min?: number }>;
  const variables = model.variables as Record<string, Record<string, number>>;
  const binaries = model.binaries as Record<string, number>;

  constraints["squad_size"] = { equal: rules.size };
  if (rules.allowCaptain) constraints["captain_count"] = { equal: 1 };
  const bonusMult = rules.allowCaptain ? rules.captainMultiplier - 1 : 0;

  const playerGroups = new Map<string, string[]>();
  pool.forEach((c) => {
    if (!playerGroups.has(c.playerSlug)) playerGroups.set(c.playerSlug, []);
    playerGroups.get(c.playerSlug)!.push(c.cardSlug);
  });
  playerGroups.forEach((cardSlugs, slug) => {
    if (cardSlugs.length > 1) constraints[`one_per_player_${slug}`] = { max: 1 };
  });

  Object.entries(rules.positionsMin).forEach(([pos, n]) => {
    constraints[`min_${pos}`] = { min: n };
  });
  Object.entries(rules.positionsMax).forEach(([pos, n]) => {
    constraints[`max_${pos}`] = { max: n };
  });
  if (rules.maxPerClub) {
    const clubs = new Set(pool.map((c) => c.clubSlug).filter(Boolean));
    clubs.forEach((club) => {
      constraints[`club_${club}`] = { max: rules.maxPerClub! };
    });
  }
  if (rules.minInSeason) constraints["min_in_season"] = { min: rules.minInSeason };
  if (rules.l15Cap != null) constraints["l15_cap"] = { max: rules.l15Cap };
  locked.forEach((slug) => {
    if (pool.some((c) => c.cardSlug === slug)) constraints[`lock_${slug}`] = { equal: 1 };
  });

  pool.forEach((c) => {
    const xVar: Record<string, number> = {
      score: c.expected,
      squad_size: 1,
    };
    const group = playerGroups.get(c.playerSlug)!;
    if (group.length > 1) xVar[`one_per_player_${c.playerSlug}`] = 1;
    Object.keys(rules.positionsMin).forEach((pos) => {
      if (pos === c.position) xVar[`min_${pos}`] = 1;
    });
    Object.keys(rules.positionsMax).forEach((pos) => {
      if (pos === c.position) xVar[`max_${pos}`] = 1;
    });
    if (rules.maxPerClub && c.clubSlug) xVar[`club_${c.clubSlug}`] = 1;
    if (rules.minInSeason && c.inSeason) xVar["min_in_season"] = 1;
    if (rules.l15Cap != null) xVar["l15_cap"] = c.l15 ?? 0;
    if (locked.includes(c.cardSlug)) xVar[`lock_${c.cardSlug}`] = 1;

    variables[`x_${c.cardSlug}`] = xVar;
    binaries[`x_${c.cardSlug}`] = 1;

    if (rules.allowCaptain) {
      // Enforce cap <= x (can't captain a card that isn't in the line-up)
      // as the linear constraint  x - cap >= 0.
      const capKey = `captain_le_x_${c.cardSlug}`;
      variables[`cap_${c.cardSlug}`] = {
        score: bonusMult * c.expected,
        captain_count: 1,
        [capKey]: -1,
      };
      binaries[`cap_${c.cardSlug}`] = 1;
      constraints[capKey] = { min: 0 };
      variables[`x_${c.cardSlug}`][capKey] = 1;
    }
  });

  const result = solver.Solve(model) as Record<string, number | boolean | string>;
  if (!result.feasible) {
    return { cards: [], captain: null, total: 0, infeasibleReason: "No line-up satisfies the rules" };
  }

  const chosenSlugs = pool.filter((c) => Number(result[`x_${c.cardSlug}`] ?? 0) > 0.5);
  const captain = pool.find((c) => Number(result[`cap_${c.cardSlug}`] ?? 0) > 0.5)?.cardSlug ?? null;

  const order: Record<string, number> = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Forward: 3 };
  const cards = chosenSlugs
    .map((c) => ({ ...c, isCaptain: c.cardSlug === captain }))
    .sort((a, b) => (order[a.position] ?? 9) - (order[b.position] ?? 9) || b.expected - a.expected);

  let total = chosenSlugs.reduce((s, c) => s + c.expected, 0);
  if (captain) total += bonusMult * chosenSlugs.find((c) => c.cardSlug === captain)!.expected;

  return { cards, captain, total: round(total), infeasibleReason: null };
}

function round(v: number) {
  return Math.round(v * 100) / 100;
}
