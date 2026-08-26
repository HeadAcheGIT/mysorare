import { prisma } from "../prisma";
import { ledgerByCard, priceComposition } from "../accountingRoi";
import type { NextGame, SquadCard } from "../types";

export type { SquadCard };


export function parseScores(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

const rank = (c: SquadCard) => c.expected ?? c.sorareProjection ?? c.l10 ?? -1;

/**
 * The game week to plan against: the next one still open for line-ups, since
 * that's the only one you can act on. Falls back to the most recent when
 * nothing is open (or before fixtures have ever been synced).
 */
export async function currentFixture(): Promise<string | null> {
  const open = await prisma.fixture.findFirst({
    where: { cutOffDate: { gt: new Date() } },
    orderBy: { cutOffDate: "asc" },
  });
  if (open) return open.slug;
  const row = await prisma.fixture.findFirst({ orderBy: { startDate: "desc" } });
  return row?.slug ?? null;
}

export async function getSquadView(
  fixture?: string | null,
  rarity?: string | null
): Promise<{ fixture: string | null; cards: SquadCard[] }> {
  const resolvedFixture = fixture ?? (await currentFixture());

  const [cards, players, projections, overrides, lastAppearances, valuations, games, ledgerRows] =
    await Promise.all([
    prisma.card.findMany(rarity ? { where: { rarity } } : undefined),
    prisma.player.findMany(),
    resolvedFixture ? prisma.projection.findMany({ where: { fixtureSlug: resolvedFixture } }) : Promise.resolve([]),
    resolvedFixture ? prisma.override.findMany({ where: { fixtureSlug: resolvedFixture } }) : Promise.resolve([]),
    // Most recent appearance per player where they actually got on the pitch.
    // This is what tells the Sparkline whether "recent" scores are actually
    // recent — recentScores itself is just the last few played games with no
    // dates attached, so a player who played twice months ago and nothing
    // since would otherwise read as being in current form.
    //
    // minutes > 0 matters: an unused substitute is on the game sheet but
    // hasn't played, and counting that as "played" is exactly the false
    // reassurance this whole signal exists to prevent. Club pre-season
    // friendlies count here too (see lib/services/friendlies.ts), so a
    // player back in action during the break doesn't read as inactive.
    prisma.appearance.groupBy({
      by: ["playerSlug"],
      where: { minutes: { gt: 0 } },
      _max: { gameDate: true },
    }),
    // What cards actually fetch, from completed sales. Read from cache rather
    // than computed here: one un-batchable Sorare request per market would put
    // minutes on a gallery load. Refreshed by /api/valuations/sync.
    prisma.playerValuation.findMany(),
    // This game week's matches, so a card can show who its player faces rather
    // than only a probability about an unnamed opponent.
    resolvedFixture
      ? prisma.game.findMany({ where: { fixtureSlug: resolvedFixture }, orderBy: { date: "asc" } })
      : Promise.resolve([]),
    // The cash ledger, for the wallet/credit split of each purchase. A plain
    // database read, so it costs the gallery nothing — and it is the only
    // place that knows a 4,87 EUR card may have taken only 2,44 EUR of cash.
    prisma.accountingEntry.findMany({ select: { cardSlug: true, entryType: true, eurAmount: true } }),
  ]);

  // Only the clubs this view can actually reference: every player's own club,
  // plus every club playing this game week (an opponent is very often not a
  // club any owned player belongs to). `Club` grows by ~250 rows a game week
  // as opponents get persisted (see gameweek.ts's persistOpponentClubs) and
  // never shrinks, so `findMany()` here used to pull the entire, ever-growing
  // table on every gallery and insights load for a handful actually shown.
  const neededClubSlugs = new Set<string>();
  for (const p of players) if (p.clubSlug) neededClubSlugs.add(p.clubSlug);
  for (const g of games) {
    neededClubSlugs.add(g.homeClubSlug);
    neededClubSlugs.add(g.awayClubSlug);
  }
  const clubs = neededClubSlugs.size
    ? await prisma.club.findMany({ where: { slug: { in: [...neededClubSlugs] } } })
    : [];

  const playerMap = new Map(players.map((p) => [p.slug, p]));
  const clubMap = new Map(clubs.map((c) => [c.slug, c]));
  const projMap = new Map(projections.map((p) => [p.playerSlug, p]));
  const overrideMap = new Map(overrides.map((o) => [o.playerSlug, o]));
  const lastPlayedMap = new Map(lastAppearances.map((a) => [a.playerSlug, a._max.gameDate ?? null]));
  // Keyed on eligibility too: in-season and classic are separate markets, and
  // collapsing them would price an old Lopez card at the in-season 6,68 €
  // instead of the 0,46 € it trades at.
  const valuationMap = new Map(
    valuations.map((v) => [`${v.playerSlug}:${v.rarity}:${v.inSeason}`, v])
  );

  const ledger = ledgerByCard(ledgerRows);

  /**
   * Each club's next match this game week.
   *
   * Games arrive ordered by date, so the first one seen for a club is the
   * earliest — which is the one a manager is deciding about. A club can play
   * twice in a week; the later match is deliberately not shown here rather
   * than crammed into a one-line summary.
   */
  const nextGameByClub = new Map<string, NextGame>();
  for (const g of games) {
    const opponentOf = (clubSlug: string, opponentSlug: string, rank: number | null, isHome: boolean) => {
      if (nextGameByClub.has(clubSlug)) return;
      const club = clubMap.get(opponentSlug);
      const own = clubMap.get(clubSlug);
      // A position only reads as "hard match" within one table, so a European
      // tie — Ligue 1 rank against a Bundesliga rank — gets no number at all.
      //
      // Known limit: Sorare's `domesticLeague` is the *eligibility* competition,
      // not the table. Every English club shares "English League Players", so a
      // cup tie against a Championship side still shows that side's own-tier
      // position. The public API exposes nothing finer to separate them.
      const comparable =
        own?.competitionSlug != null && club?.competitionSlug === own.competitionSlug;
      nextGameByClub.set(clubSlug, {
        date: g.date?.toISOString() ?? null,
        opponentSlug,
        // Falls back to the slug: an unenriched opponent should still be named,
        // not shown as an empty gap.
        opponentName: club?.name ?? opponentSlug,
        opponentPicture: club?.pictureUrl ?? null,
        isHome,
        opponentRank: comparable ? rank : null,
      });
    };
    opponentOf(g.homeClubSlug, g.awayClubSlug, g.awayRanking, true);
    opponentOf(g.awayClubSlug, g.homeClubSlug, g.homeRanking, false);
  }

  const out: SquadCard[] = cards
    // Annotated so the shape is checked against SquadCard here rather than
    // inferred and only failing at the filter below.
    .map((c): SquadCard | null => {
      const p = playerMap.get(c.playerSlug);
      if (!p) return null;
      const proj = projMap.get(p.slug);
      const ov = overrideMap.get(p.slug);
      const club = p.clubSlug ? clubMap.get(p.clubSlug) : null;
      const val = valuationMap.get(`${c.playerSlug}:${c.rarity}:${c.inSeason}`) ?? null;
      return {
        cardSlug: c.slug,
        playerSlug: p.slug,
        name: p.displayName,
        position: p.position,
        rarity: c.rarity,
        season: c.season,
        inSeason: c.inSeason,
        serial: c.serialNumber,
        bonus: c.bonus,
        club: club?.name ?? null,
        clubSlug: p.clubSlug,
        clubPicture: club?.pictureUrl ?? null,
        injury: p.injuryStatus,
        suspended: p.suspended,
        pStart: ov?.pStart ?? proj?.pStart ?? null,
        pPlay: proj?.pPlay ?? null,
        // A manual override replaces the number but not its meaning, so the
        // basis stays whatever the model computed — except that an overridden
        // value is a human read on starting, which is exactly what "starts"
        // claims, so it is not downgraded either.
        pStartBasis: (proj?.pStartBasis as SquadCard["pStartBasis"]) ?? null,
        sorareStarterOdds: proj?.sorareStarterOdds ?? p.sorareStarterOdds ?? null,
        confidence: proj?.confidence ?? null,
        expected: ov?.expectedScore ?? proj?.expectedScore ?? null,
        floor: proj?.floorScore ?? null,
        l5: proj?.l5 ?? null,
        l15: proj?.l15 ?? null,
        note: ov?.note ?? proj?.note ?? null,
        excluded: ov?.exclude ?? false,

        picture: p.pictureUrl,
        country: p.country,
        age: p.age,
        birthDate: p.birthDate?.toISOString() ?? null,
        shirtNumber: p.shirtNumber,
        sorareProjection: p.sorareProjection,
        recentScores: parseScores(p.recentScores),
        lastPlayedAt: lastPlayedMap.get(p.slug)?.toISOString() ?? null,
        competitionSlug: club?.competitionSlug ?? null,
        competitionName: club?.competitionName ?? null,
        l10: c.l10,
        price: c.price,
        floorPrice: c.floorPrice,
        estimatedPrice: c.estimatedPrice,
        boughtPrice: c.boughtPrice,
        boughtPriceApprox: c.boughtPriceApprox,
        acquiredVia: c.acquiredVia,
        acquiredAt: c.acquiredAt?.toISOString() ?? null,
        paidWithCredits: c.paidWithCredits,
        sealedAt: c.sealedAt?.toISOString() ?? null,
        // Null unless an accounting export has been imported — an unknown
        // split must stay unknown rather than read as "no credits used".
        priceComposition: priceComposition(c.boughtPrice, ledger.get(c.slug)),
        nextGame: (p.clubSlug ? nextGameByClub.get(p.clubSlug) : null) ?? null,
        // Mapped field by field rather than spread: the row carries the
        // composite key and computedAt too, which aren't part of a Valuation.
        valuation: val
          ? {
              value: val.value,
              low: val.low,
              high: val.high,
              sampleSize: val.sampleSize,
              totalSales: val.totalSales,
              windowDays: val.windowDays,
              daysSinceLast: val.daysSinceLast,
              trendPct: val.trendPct,
              launchPremium: val.launchPremium,
              thin: val.thin,
            }
          : null,
      };
    })
    .filter((x): x is SquadCard => x != null)
    // Best available signal first: our projection, else Sorare's, else the
    // CSV's 10-game average — so the list stays usefully ordered even before
    // any projection has been computed.
    .sort((a, b) => rank(b) - rank(a));

  return { fixture: resolvedFixture, cards: out };
}
