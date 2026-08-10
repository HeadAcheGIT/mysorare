/**
 * Everything here is called at request time, on tap — nothing runs in the
 * background. Each search or refresh is one or two GraphQL calls, priced
 * (in rate-limit terms) the same as any other on-demand action in the app.
 */
import { graphql } from "../sorare/client";
import { PLAYER_MARKET, SEARCH_PLAYERS } from "../sorare/queries";

export interface PlayerSearchResult {
  slug: string;
  name: string;
  position: string;
  club: string | null;
}

export interface MarketFloor {
  slug: string;
  name: string;
  floorByRarity: Record<string, number | null>; // eur, null = nothing currently listed
  listedCount: number;
}

export async function searchPlayers(query: string): Promise<PlayerSearchResult[]> {
  const data = await graphql<any>(SEARCH_PLAYERS, { search: query });
  const nodes = data?.football?.players ?? [];
  return nodes.map((p: any) => ({
    slug: p.slug,
    name: p.displayName,
    position: p.position,
    club: p.activeClub?.name ?? null,
  }));
}

export async function getPlayerMarket(slug: string): Promise<MarketFloor> {
  const data = await graphql<any>(PLAYER_MARKET, { slug });
  const player = data?.football?.player;
  const cards = player?.cards?.nodes ?? [];

  const floorByRarity: Record<string, number | null> = {
    common: null,
    limited: null,
    rare: null,
    super_rare: null,
    unique: null,
  };
  let listedCount = 0;

  for (const c of cards) {
    const price = c.liveSingleSaleOffer?.receiverSide?.amounts?.eur;
    if (price == null) continue;
    listedCount++;
    const rarity = (c.rarityTyped ?? "").toLowerCase();
    const value = Number(price);
    if (floorByRarity[rarity] == null || value < floorByRarity[rarity]!) {
      floorByRarity[rarity] = value;
    }
  }

  return { slug, name: player?.displayName ?? slug, floorByRarity, listedCount };
}
