import { prisma } from "../prisma";
import type { SquadCard } from "../types";

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

  const [cards, players, clubs, projections, overrides, lastAppearances] = await Promise.all([
    prisma.card.findMany(rarity ? { where: { rarity } } : undefined),
    prisma.player.findMany(),
    prisma.club.findMany(),
    resolvedFixture ? prisma.projection.findMany({ where: { fixtureSlug: resolvedFixture } }) : Promise.resolve([]),
    resolvedFixture ? prisma.override.findMany({ where: { fixtureSlug: resolvedFixture } }) : Promise.resolve([]),
    // Most recent *dated* appearance per player. This is what tells the
    // Sparkline whether "recent" scores are actually recent — recentScores
    // itself is just the last few played games with no dates attached, so a
    // player who played twice months ago and nothing since would otherwise
    // read as being in current form.
    prisma.appearance.groupBy({
      by: ["playerSlug"],
      _max: { gameDate: true },
    }),
  ]);

  const playerMap = new Map(players.map((p) => [p.slug, p]));
  const clubMap = new Map(clubs.map((c) => [c.slug, c]));
  const projMap = new Map(projections.map((p) => [p.playerSlug, p]));
  const overrideMap = new Map(overrides.map((o) => [o.playerSlug, o]));
  const lastPlayedMap = new Map(lastAppearances.map((a) => [a.playerSlug, a._max.gameDate ?? null]));

  const out: SquadCard[] = cards
    .map((c) => {
      const p = playerMap.get(c.playerSlug);
      if (!p) return null;
      const proj = projMap.get(p.slug);
      const ov = overrideMap.get(p.slug);
      const club = p.clubSlug ? clubMap.get(p.clubSlug) : null;
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
      };
    })
    .filter((x): x is SquadCard => x != null)
    // Best available signal first: our projection, else Sorare's, else the
    // CSV's 10-game average — so the list stays usefully ordered even before
    // any projection has been computed.
    .sort((a, b) => rank(b) - rank(a));

  return { fixture: resolvedFixture, cards: out };
}
