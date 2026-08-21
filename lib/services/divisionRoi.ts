import { prisma } from "../prisma";
import { cardValue } from "../types";
import { divisionRoi, type DivisionEntry, type DivisionRoi } from "../divisionRoi";

/**
 * Rewards actually collected per division, against the cards it took to play.
 *
 * Joins three things the app already holds: what each entry paid
 * (`SeasonReward`), which cards were fielded for it (`AlignedLineup`), and what
 * those cards are worth (`cardValue`, the same figure the rest of the app
 * uses). No Sorare request.
 */
export async function divisionRoiReport(): Promise<DivisionRoi[]> {
  const [rewards, aligned, cards, valuations] = await Promise.all([
    prisma.seasonReward.findMany(),
    prisma.alignedLineup.findMany({
      select: { fixtureSlug: true, leaderboardSlug: true, cardSlug: true },
    }),
    prisma.card.findMany({
      select: {
        slug: true,
        playerSlug: true,
        rarity: true,
        inSeason: true,
        price: true,
        floorPrice: true,
      },
    }),
    prisma.playerValuation.findMany(),
  ]);

  if (!rewards.length) return [];

  const valuationMap = new Map(valuations.map((v) => [`${v.playerSlug}:${v.rarity}:${v.inSeason}`, v]));
  const valueBySlug = new Map<string, number | null>();
  for (const c of cards) {
    valueBySlug.set(
      c.slug,
      cardValue({
        valuation: valuationMap.get(`${c.playerSlug}:${c.rarity}:${c.inSeason}`) ?? null,
        price: c.price,
        floorPrice: c.floorPrice,
      })
    );
  }

  // Capital per entry: the cards fielded for that division, that game week.
  const capital = new Map<string, { sum: number; valued: number; total: number }>();
  for (const row of aligned) {
    if (!row.leaderboardSlug) continue;
    const key = `${row.fixtureSlug}:${row.leaderboardSlug}`;
    const acc = capital.get(key) ?? { sum: 0, valued: 0, total: 0 };
    acc.total++;
    const v = valueBySlug.get(row.cardSlug);
    if (v != null) {
      acc.sum += v;
      acc.valued++;
    }
    capital.set(key, acc);
  }

  const entries: DivisionEntry[] = rewards.map((r) => {
    const c = capital.get(`${r.fixtureSlug}:${r.leaderboardSlug}`);
    // A line-up valued only in part would understate the capital and inflate
    // the yield, so it counts as unknown rather than as a smaller number.
    const complete = c != null && c.total > 0 && c.valued === c.total;
    return {
      leaderboardSlug: r.leaderboardSlug,
      leaderboardName: r.leaderboardName,
      division: r.division,
      rewardEur: r.rewardEur,
      rewardCards: r.rewardCards,
      lineupValue: complete ? c!.sum : null,
      ranking: r.ranking,
    };
  });

  return divisionRoi(entries);
}
