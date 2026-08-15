import { prisma } from "../prisma";
import { graphql } from "../sorare/client";
import { MY_REWARDS_FOR_FIXTURE } from "../sorare/queries";

/**
 * What the game weeks actually returned.
 *
 * Everything else in this app is a projection; this is the only place real
 * money appears, and it's what turns "my compos looked good" into "my gallery
 * earned X against the Y it cost". Sourced from the authenticated
 * `mySo5Rankings` / `so5Rewards`.
 */

type RankingNode = {
  id: string;
  ranking: number | null;
  score: number | null;
  so5Leaderboard: { slug: string; displayName: string | null; division: number | null } | null;
  so5Rewards: { amount: { eurCents: number | null } | null; rewardCards: { anyCard: { slug: string } | null }[] | null }[] | null;
};

export async function syncRewards(fixtureSlugs: string[]): Promise<{ fixtures: number; rows: number }> {
  let rows = 0;
  let failed = 0;

  for (const fixtureSlug of fixtureSlugs) {
    try {
      const data = await graphql<{
        so5: { so5Fixture: { gameWeek: number | null; mySo5Rankings: RankingNode[] } | null };
      }>(MY_REWARDS_FOR_FIXTURE, { slug: fixtureSlug });

      const fixture = data?.so5?.so5Fixture;
      for (const r of fixture?.mySo5Rankings ?? []) {
        // A fixture still in play has a ranking but no settled reward. Storing
        // 0 € then would read as "earned nothing" rather than "not paid yet",
        // so cash stays null until a reward actually exists.
        const paid = r.so5Rewards ?? [];
        const rewardEur = paid.length
          ? paid.reduce((sum, x) => sum + (x.amount?.eurCents ?? 0), 0) / 100
          : null;
        const rewardCards = paid.reduce((sum, x) => sum + (x.rewardCards?.length ?? 0), 0);

        const row = {
          fixtureSlug,
          gameWeek: fixture?.gameWeek ?? null,
          leaderboardSlug: r.so5Leaderboard?.slug ?? "inconnu",
          leaderboardName: r.so5Leaderboard?.displayName ?? null,
          division: r.so5Leaderboard?.division ?? null,
          ranking: r.ranking ?? null,
          score: r.score ?? null,
          rewardEur,
          rewardCards,
          syncedAt: new Date(),
        };
        await prisma.seasonReward.upsert({
          where: { id: r.id },
          create: { id: r.id, ...row },
          update: row,
        });
        rows++;
      }
    } catch (err) {
      failed++;
      await prisma.syncLog.create({
        data: {
          job: "rewards",
          status: "error",
          detail: `${fixtureSlug}: ${(err as Error).message}`.slice(0, 2000),
        },
      });
    }
  }

  await prisma.syncLog.create({
    data: {
      job: "rewards",
      status: failed ? "error" : "ok",
      detail: `${rows} classements sur ${fixtureSlugs.length} game week(s)${failed ? `, ${failed} en échec` : ""}`,
    },
  });
  return { fixtures: fixtureSlugs.length, rows };
}

export interface GameWeekResult {
  fixtureSlug: string;
  gameWeek: number | null;
  entries: {
    leaderboardName: string;
    division: number | null;
    ranking: number | null;
    score: number | null;
    rewardEur: number | null;
    rewardCards: number;
  }[];
  totalEur: number;
  totalCards: number;
  /** True while at least one line-up has a ranking but no settled reward. */
  pending: boolean;
}

export interface SeasonSummary {
  gameWeeks: GameWeekResult[];
  /** Cash won across every synced game week. */
  totalEur: number;
  totalCards: number;
  lineupsPlayed: number;
  /** What the gallery cost, from the prices the CSV carried. Null when none are known. */
  spentEur: number | null;
  /**
   * Earnings minus spend. Deliberately null without a known spend rather than
   * showing the winnings alone as a "profit" — that would flatter the result
   * by exactly the amount the cards cost.
   */
  netEur: number | null;
  bestRanking: { ranking: number; leaderboardName: string; gameWeek: number | null } | null;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Pure: folds stored rows into per-game-week results and season totals. */
export function summarizeSeason(
  rows: {
    fixtureSlug: string;
    gameWeek: number | null;
    leaderboardName: string | null;
    division: number | null;
    ranking: number | null;
    score: number | null;
    rewardEur: number | null;
    rewardCards: number;
  }[],
  spentEur: number | null
): SeasonSummary {
  const byFixture = new Map<string, GameWeekResult>();

  for (const r of rows) {
    let gw = byFixture.get(r.fixtureSlug);
    if (!gw) {
      gw = {
        fixtureSlug: r.fixtureSlug,
        gameWeek: r.gameWeek,
        entries: [],
        totalEur: 0,
        totalCards: 0,
        pending: false,
      };
      byFixture.set(r.fixtureSlug, gw);
    }
    gw.entries.push({
      leaderboardName: r.leaderboardName ?? "Division inconnue",
      division: r.division,
      ranking: r.ranking,
      score: r.score,
      rewardEur: r.rewardEur,
      rewardCards: r.rewardCards,
    });
    gw.totalEur += r.rewardEur ?? 0;
    gw.totalCards += r.rewardCards;
    if (r.rewardEur == null && r.rewardCards === 0) gw.pending = true;
  }

  const gameWeeks = [...byFixture.values()]
    .map((gw) => ({ ...gw, totalEur: round(gw.totalEur) }))
    .sort((a, b) => (b.gameWeek ?? 0) - (a.gameWeek ?? 0));

  const totalEur = round(gameWeeks.reduce((s, g) => s + g.totalEur, 0));
  const totalCards = gameWeeks.reduce((s, g) => s + g.totalCards, 0);

  const ranked = rows.filter((r) => r.ranking != null);
  const best = ranked.length
    ? ranked.reduce((a, b) => ((a.ranking as number) <= (b.ranking as number) ? a : b))
    : null;

  return {
    gameWeeks,
    totalEur,
    totalCards,
    lineupsPlayed: rows.length,
    spentEur,
    netEur: spentEur == null ? null : round(totalEur - spentEur),
    bestRanking: best
      ? {
          ranking: best.ranking as number,
          leaderboardName: best.leaderboardName ?? "Division inconnue",
          gameWeek: best.gameWeek,
        }
      : null,
  };
}

export async function seasonSummary(): Promise<SeasonSummary> {
  const [rows, cards] = await Promise.all([
    prisma.seasonReward.findMany(),
    prisma.card.findMany({ select: { boughtPrice: true } }),
  ]);

  const priced = cards.filter((c) => c.boughtPrice != null);
  const spentEur = priced.length ? round(priced.reduce((s, c) => s + (c.boughtPrice as number), 0)) : null;

  return summarizeSeason(rows, spentEur);
}
