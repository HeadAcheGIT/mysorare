/**
 * Aggregates independent readings on "will this player start" into one
 * probability plus a confidence score reflecting how much the sources agree.
 *
 * Two sources are live today:
 *   - internal_form: the existing minutes/starts model (see projections.ts)
 *   - injury_status: a hard override, not a vote — an active injury or
 *     suspension zeroes pStart outright rather than just nudging an average,
 *     because "he's injured" isn't a probabilistic opinion to blend in.
 *
 * fixture_congestion is a light heuristic from the player's own recent
 * appearance frequency (proxy for rotation risk) — real but approximate.
 *
 * squad_depth and external_probable (Sofascore/Fotmob-style probable
 * line-ups) are NOT implemented. squad_depth would need full club rosters,
 * which this app doesn't fetch (only your own cards). external_probable
 * would need scraping third-party sites, which raises ToS questions this
 * project doesn't try to route around. Both write a row with pStart: null
 * so the schema and the UI already have a place for them if you plug in a
 * legitimate data source later.
 */
import type { Appearance } from "@prisma/client";

export interface SourceReading {
  source: "internal_form" | "injury_status" | "fixture_congestion" | "squad_depth" | "external_probable";
  pStart: number | null; // null = this source doesn't vote (e.g. not wired up yet)
  weight: number;
  detail?: string;
}

export interface Aggregate {
  pStart: number;
  confidence: number; // 0-1
  note: string;
}

export function aggregateSources(readings: SourceReading[]): Aggregate {
  // A hard override (injury/suspension) short-circuits everything else.
  const override = readings.find((r) => r.source === "injury_status" && r.pStart === 0);
  if (override) {
    return { pStart: 0, confidence: 1, note: override.detail ?? "Injured or suspended" };
  }

  const voters = readings.filter((r): r is SourceReading & { pStart: number } => r.pStart != null);
  if (voters.length === 0) {
    return { pStart: 0, confidence: 0, note: "No source data" };
  }

  const totalWeight = voters.reduce((s, v) => s + v.weight, 0);
  const mean = voters.reduce((s, v) => s + v.pStart * v.weight, 0) / totalWeight;

  const variance = voters.reduce((s, v) => s + v.weight * (v.pStart - mean) ** 2, 0) / totalWeight;
  const stddev = Math.sqrt(variance);
  // stddev 0 (perfect agreement) -> 1; stddev >= 0.5 (max spread for a 0-1 value) -> 0
  const agreement = Math.max(0, 1 - stddev / 0.5);
  // A single source can't be "confident" no matter how extreme its reading —
  // confidence needs corroboration. Full weight kicks in at 3+ voting sources.
  const coverage = Math.min(1, voters.length / 3);
  const confidence = agreement * (0.4 + 0.6 * coverage);

  const note = voters.map((v) => `${v.source}:${Math.round(v.pStart * 100)}%`).join(" · ");
  return { pStart: round(mean, 3), confidence: round(confidence, 2), note };
}

/**
 * Rotation-risk proxy from the player's own appearance density: three or
 * more games in the eight days before the fixture suggests fatigue-driven
 * rotation risk even for an otherwise nailed-on starter. This is a heuristic,
 * not a fact — it has no idea about the actual matches upcoming for the club,
 * only about games this player has already played.
 */
export function congestionReading(recentAppearances: Pick<Appearance, "gameDate">[], asOf: Date): SourceReading {
  const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
  const recentCount = recentAppearances.filter(
    (a) => a.gameDate && asOf.getTime() - a.gameDate.getTime() <= eightDaysMs
  ).length;

  if (recentCount === 0) {
    return { source: "fixture_congestion", pStart: null, weight: 0.4, detail: "No recent games to assess load" };
  }
  if (recentCount >= 3) {
    return {
      source: "fixture_congestion",
      pStart: 0.55,
      weight: 0.4,
      detail: `${recentCount} games in the last 8 days — rotation risk`,
    };
  }
  return { source: "fixture_congestion", pStart: 0.75, weight: 0.2, detail: `${recentCount} recent games, normal load` };
}

function round(v: number, dp = 2) {
  const m = 10 ** dp;
  return Math.round(v * m) / m;
}
