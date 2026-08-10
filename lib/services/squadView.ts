import { prisma } from "../prisma";

export interface SquadCard {
  cardSlug: string;
  playerSlug: string;
  name: string;
  position: string;
  rarity: string;
  season: number | null;
  inSeason: boolean;
  serial: number | null;
  bonus: number;
  club: string | null;
  clubSlug: string | null;
  injury: string | null;
  pStart: number | null;
  confidence: number | null;
  expected: number | null;
  floor: number | null;
  l5: number | null;
  l15: number | null;
  note: string | null;
  excluded: boolean;
}

export async function currentFixture(): Promise<string | null> {
  const row = await prisma.fixture.findFirst({ orderBy: { startDate: "desc" } });
  return row?.slug ?? null;
}

export async function getSquadView(
  fixture?: string | null,
  rarity?: string | null
): Promise<{ fixture: string | null; cards: SquadCard[] }> {
  const resolvedFixture = fixture ?? (await currentFixture());

  const [cards, players, clubs, projections, overrides] = await Promise.all([
    prisma.card.findMany(rarity ? { where: { rarity } } : undefined),
    prisma.player.findMany(),
    prisma.club.findMany(),
    resolvedFixture ? prisma.projection.findMany({ where: { fixtureSlug: resolvedFixture } }) : Promise.resolve([]),
    resolvedFixture ? prisma.override.findMany({ where: { fixtureSlug: resolvedFixture } }) : Promise.resolve([]),
  ]);

  const playerMap = new Map(players.map((p) => [p.slug, p]));
  const clubMap = new Map(clubs.map((c) => [c.slug, c]));
  const projMap = new Map(projections.map((p) => [p.playerSlug, p]));
  const overrideMap = new Map(overrides.map((o) => [o.playerSlug, o]));

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
        injury: p.injuryStatus,
        pStart: ov?.pStart ?? proj?.pStart ?? null,
        confidence: proj?.confidence ?? null,
        expected: ov?.expectedScore ?? proj?.expectedScore ?? null,
        floor: proj?.floorScore ?? null,
        l5: proj?.l5 ?? null,
        l15: proj?.l15 ?? null,
        note: ov?.note ?? proj?.note ?? null,
        excluded: ov?.exclude ?? false,
      };
    })
    .filter((x): x is SquadCard => x != null)
    .sort((a, b) => (b.expected ?? -1) - (a.expected ?? -1));

  return { fixture: resolvedFixture, cards: out };
}
