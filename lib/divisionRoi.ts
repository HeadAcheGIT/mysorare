/**
 * Which divisions actually pay, per euro of cards tied up in them.
 *
 * "Which division has the biggest prize pool" is the wrong question: a pool you
 * need 400 € of cards to compete for can return less, per euro committed, than
 * a smaller one you enter with 40 €. What a manager decides on is the **yield**
 * — what came back against what had to be held to play.
 *
 * The capital is not spent, it is immobilised: you keep the cards. So this is a
 * return on capital employed, not a profit margin, and the wording says so
 * rather than letting a 30 % read as a 30 % profit.
 *
 * Pure and free of server imports.
 */

export interface DivisionEntry {
  leaderboardSlug: string;
  leaderboardName: string | null;
  division: number | null;
  /** Cash won for that entry, in EUR. Null when the finish paid cards only. */
  rewardEur: number | null;
  rewardCards: number;
  /** Value of the cards fielded for that entry — null when none could be valued. */
  lineupValue: number | null;
  ranking: number | null;
}

export interface DivisionRoi {
  leaderboardSlug: string;
  leaderboardName: string | null;
  division: number | null;
  /** Game weeks entered. */
  entries: number;
  totalEur: number;
  cardsWon: number;
  /** Mean value of a line-up fielded here — the capital an entry ties up. */
  avgCapital: number | null;
  /** Cash returned per euro committed, as a percentage. Null without capital. */
  yieldPct: number | null;
  /** Average finishing position, when known. */
  avgRanking: number | null;
  /** Entries whose line-up couldn't be valued, so a partial figure admits it. */
  unvalued: number;
}

const round = (v: number) => Math.round(v * 100) / 100;

export function divisionRoi(entries: DivisionEntry[]): DivisionRoi[] {
  const byDivision = new Map<string, DivisionEntry[]>();
  for (const e of entries) {
    if (!byDivision.has(e.leaderboardSlug)) byDivision.set(e.leaderboardSlug, []);
    byDivision.get(e.leaderboardSlug)!.push(e);
  }

  const out: DivisionRoi[] = [];

  for (const [slug, rows] of byDivision) {
    const valued = rows.filter((r) => r.lineupValue != null && r.lineupValue > 0);
    const capitalSum = valued.reduce((s, r) => s + (r.lineupValue as number), 0);
    const totalEur = rows.reduce((s, r) => s + (r.rewardEur ?? 0), 0);
    const ranked = rows.filter((r) => r.ranking != null);

    // The yield only counts entries whose capital is known, on both sides —
    // dividing every reward by a partial capital would inflate it.
    const eurOnValued = valued.reduce((s, r) => s + (r.rewardEur ?? 0), 0);

    out.push({
      leaderboardSlug: slug,
      leaderboardName: rows[0].leaderboardName,
      division: rows[0].division,
      entries: rows.length,
      totalEur: round(totalEur),
      cardsWon: rows.reduce((s, r) => s + r.rewardCards, 0),
      avgCapital: valued.length ? round(capitalSum / valued.length) : null,
      yieldPct: capitalSum > 0 ? round((eurOnValued / capitalSum) * 100) : null,
      avgRanking: ranked.length
        ? round(ranked.reduce((s, r) => s + (r.ranking as number), 0) / ranked.length)
        : null,
      unvalued: rows.length - valued.length,
    });
  }

  // Best yield first; a division with no measurable yield sorts last rather
  // than at the top, which is where a null would land in a naive sort.
  return out.sort((a, b) => (b.yieldPct ?? -Infinity) - (a.yieldPct ?? -Infinity));
}

/** Plain-French reading, so the percentage carries a judgement. */
export function yieldVerdict(r: DivisionRoi): { label: string; tone: "ok" | "neutral" | "warn" } {
  if (r.yieldPct == null) return { label: "Rendement inconnu", tone: "neutral" };
  if (r.entries < 3) return { label: `Trop peu d'entrées (${r.entries})`, tone: "neutral" };
  if (r.yieldPct >= 5) return { label: "Rentable", tone: "ok" };
  if (r.yieldPct > 0) return { label: "Faiblement rentable", tone: "neutral" };
  return { label: "Ne rapporte rien", tone: "warn" };
}
