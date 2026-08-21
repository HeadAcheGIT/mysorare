import { prisma } from "../prisma";
import { optimise } from "./optimizer";
import { SO5_SHAPE } from "./divisionLineup";
import { computeRegret, regretVerdict, scoreLineup, type Regret, type ScoredCard } from "../debrief";

/**
 * Post-mortem of a played game week: what was fielded, against the best that
 * was actually available.
 *
 * Deliberately built without a single Sorare request. Everything needed is
 * already local — the line-ups that were synced, the appearances that were
 * scored, and the cards owned — and a past game week's bench can't be re-read
 * from the API anyway.
 */

export interface DivisionDebrief {
  leaderboardSlug: string | null;
  leaderboardName: string | null;
  division: number | null;
  /** Sorare's own total for the fielded line-up, carried as a reference only. */
  officialTotal: number | null;
  regret: Regret;
  verdict: { label: string; tone: "ok" | "neutral" | "warn" };
  /** Cards considered available for this game week. */
  poolSize: number;
}

export interface FixtureDebrief {
  fixtureSlug: string;
  played: boolean;
  divisions: DivisionDebrief[];
  /** True when some owned cards had to be excluded for lack of an acquisition date. */
  poolApproximate: boolean;
}

export async function debriefFixture(fixtureSlug: string): Promise<FixtureDebrief> {
  const [aligned, fixture] = await Promise.all([
    prisma.alignedLineup.findMany({ where: { fixtureSlug } }),
    prisma.fixture.findUnique({ where: { slug: fixtureSlug } }),
  ]);

  if (!aligned.length || !fixture?.startDate || !fixture?.endDate) {
    return { fixtureSlug, played: false, divisions: [], poolApproximate: false };
  }

  // Everything owned that could plausibly have been fielded. `acquiredAt`
  // filters out cards bought *after* the game week, which would otherwise let
  // the "best possible" line-up use cards that weren't owned yet — the classic
  // way a backtest flatters itself.
  const cards = await prisma.card.findMany({
    select: { slug: true, playerSlug: true, rarity: true, acquiredAt: true },
  });
  const owned = cards.filter((c) => c.acquiredAt == null || c.acquiredAt <= fixture.startDate!);
  const poolApproximate = cards.some((c) => c.acquiredAt == null);

  const playerSlugs = [...new Set(owned.map((c) => c.playerSlug))];
  const [players, appearances] = await Promise.all([
    prisma.player.findMany({
      where: { slug: { in: playerSlugs } },
      select: { slug: true, displayName: true, position: true },
    }),
    prisma.appearance.findMany({
      where: {
        playerSlug: { in: playerSlugs },
        gameDate: { gte: fixture.startDate, lte: fixture.endDate },
      },
      select: { playerSlug: true, score: true },
    }),
  ]);

  const playerMap = new Map(players.map((p) => [p.slug, p]));

  // A club can play twice in a game week; Sorare counts both, so the scores add.
  const scoreByPlayer = new Map<string, number>();
  for (const a of appearances) {
    if (a.score == null) continue;
    scoreByPlayer.set(a.playerSlug, (scoreByPlayer.get(a.playerSlug) ?? 0) + a.score);
  }

  const groups = new Map<string, typeof aligned>();
  for (const row of aligned) {
    const key = row.leaderboardSlug ?? "__none__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const divisions: DivisionDebrief[] = [];

  for (const rows of groups.values()) {
    const head = rows[0];

    // The fielded line-up, scored on our own ruler so both sides of the
    // comparison use the same source.
    const actual: ScoredCard[] = rows.map((r) => ({
      cardSlug: r.cardSlug,
      playerSlug: r.playerSlug,
      playerName: playerMap.get(r.playerSlug)?.displayName ?? r.playerSlug,
      position: r.position ?? playerMap.get(r.playerSlug)?.position ?? "Midfielder",
      score: scoreByPlayer.get(r.playerSlug) ?? null,
      captain: r.captain,
    }));

    // Same rarity as what was actually fielded: a division is rarity-locked,
    // and letting the solver reach for a rarity you couldn't field would
    // invent a line-up that was never allowed.
    const fieldedRarities = new Set(
      rows.map((r) => cards.find((c) => c.slug === r.cardSlug)?.rarity).filter(Boolean) as string[]
    );

    const pool = owned
      .filter((c) => !fieldedRarities.size || fieldedRarities.has(c.rarity))
      .map((c) => {
        const p = playerMap.get(c.playerSlug);
        return {
          cardSlug: c.slug,
          playerSlug: c.playerSlug,
          playerName: p?.displayName ?? c.playerSlug,
          position: p?.position ?? "Midfielder",
          rarity: c.rarity,
          clubSlug: null,
          inSeason: false,
          // The solver maximises `expected`; feeding it the realised score is
          // what turns it from a forecaster into a hindsight optimum.
          expected: scoreByPlayer.get(c.playerSlug) ?? 0,
          pStart: 1,
          l15: null,
          bonus: 0,
        };
      });

    const solution = optimise(pool, SO5_SHAPE, [], []);
    const best: ScoredCard[] = solution.cards.map((c) => ({
      cardSlug: c.cardSlug,
      playerSlug: c.playerSlug,
      playerName: c.playerName,
      position: c.position,
      score: scoreByPlayer.get(c.playerSlug) ?? null,
      captain: c.isCaptain,
    }));

    const officialScores = rows.map((r) => r.actualScore).filter((s): s is number => s != null);
    const regret = computeRegret(actual, best);

    divisions.push({
      leaderboardSlug: head.leaderboardSlug,
      leaderboardName: head.leaderboardName,
      division: head.division,
      officialTotal: officialScores.length
        ? scoreLineup(
            rows.map((r) => ({
              cardSlug: r.cardSlug,
              playerSlug: r.playerSlug,
              playerName: "",
              position: "",
              score: r.actualScore,
              captain: r.captain,
            }))
          )
        : null,
      regret,
      verdict: regretVerdict(regret),
      poolSize: pool.length,
    });
  }

  return {
    fixtureSlug,
    played: scoreByPlayer.size > 0,
    divisions: divisions.sort((a, b) => (a.division ?? 999) - (b.division ?? 999)),
    poolApproximate,
  };
}
