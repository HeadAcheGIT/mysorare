import { prisma } from "../prisma";
import { PRIMARY_RARITY } from "../types";
import { rankUpgrades, weakestPosition, type Candidate, type OwnedCard, type Upgrade } from "../buyAdvice";

/**
 * What to buy next, drawn from the players already on the watchlist.
 *
 * The pool is deliberately the watchlist rather than the whole market: those
 * are the players actually being tracked (and, since the Sorare import, the
 * ones tracked on Sorare itself), they are already enriched and projected, and
 * scouting the open market instead would mean one paced API request per player
 * before the screen could show anything.
 *
 * Everything here is local — no Sorare request.
 */

const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

export interface BuyAdvice {
  /** Ranked upgrades, best value first. */
  upgrades: Upgrade[];
  /** Where the squad is thinnest, so a buy there helps most. */
  weakest: string | null;
  /** Spendable balance in EUR, null when not signed in. */
  budget: number | null;
  /** Players on the watchlist considered. */
  watched: number;
  /** Watchlist players with no projection or no valuation yet. */
  incomplete: number;
}

export async function buyAdvice(fixtureSlug: string | null, budget: number | null): Promise<BuyAdvice> {
  const [items, cards, players] = await Promise.all([
    prisma.watchlistItem.findMany({ select: { playerSlug: true, label: true } }),
    prisma.card.findMany({
      select: { playerSlug: true, rarity: true, inSeason: true, price: true, floorPrice: true },
    }),
    prisma.player.findMany({ select: { slug: true, displayName: true, position: true } }),
  ]);

  const ownedPlayers = new Set(cards.map((c) => c.playerSlug));
  // A player already owned isn't an upgrade to buy — you'd be buying a second
  // card of someone you can already field.
  const watchedSlugs = [...new Set(items.map((i) => i.playerSlug))].filter((s) => !ownedPlayers.has(s));

  const [projections, valuations] = await Promise.all([
    fixtureSlug
      ? prisma.projection.findMany({
          where: { fixtureSlug, playerSlug: { in: watchedSlugs } },
          select: { playerSlug: true, expectedScore: true, pStart: true },
        })
      : Promise.resolve([]),
    prisma.playerValuation.findMany({
      where: { playerSlug: { in: watchedSlugs }, rarity: PRIMARY_RARITY, inSeason: true },
    }),
  ]);

  const playerMap = new Map(players.map((p) => [p.slug, p]));
  const projMap = new Map(projections.map((p) => [p.playerSlug, p]));
  const valMap = new Map(valuations.map((v) => [v.playerSlug, v]));
  const labelMap = new Map(items.map((i) => [i.playerSlug, i.label]));

  let incomplete = 0;
  const candidates: Candidate[] = [];

  for (const slug of watchedSlugs) {
    const proj = projMap.get(slug);
    const val = valMap.get(slug);
    const player = playerMap.get(slug);

    if (!proj || val?.value == null) {
      incomplete++;
      continue;
    }

    candidates.push({
      playerSlug: slug,
      playerName: player?.displayName ?? labelMap.get(slug) ?? slug,
      position: player?.position ?? "Midfielder",
      expected: proj.expectedScore,
      price: val.value,
      thin: val.thin,
      launchPremium: val.launchPremium,
    });
  }

  // The squad side of the comparison, valued the same way as everywhere else.
  const owned: OwnedCard[] = [];
  const ownedProjections = fixtureSlug
    ? await prisma.projection.findMany({
        where: { fixtureSlug, playerSlug: { in: [...ownedPlayers] } },
        select: { playerSlug: true, expectedScore: true },
      })
    : [];
  const ownedProjMap = new Map(ownedProjections.map((p) => [p.playerSlug, p.expectedScore]));

  for (const c of cards) {
    const player = playerMap.get(c.playerSlug);
    if (!player) continue;
    owned.push({ position: player.position, expected: ownedProjMap.get(c.playerSlug) ?? null });
  }

  return {
    upgrades: rankUpgrades(owned, candidates, budget).slice(0, 20),
    weakest: weakestPosition(owned, POSITIONS),
    budget,
    watched: watchedSlugs.length,
    incomplete,
  };
}
