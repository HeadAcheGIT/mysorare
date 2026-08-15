import { NextRequest, NextResponse } from "next/server";
import { listLeagues, scoutLeague, scoutPlayerContext } from "@/lib/services/scouting";
import { TRACKED_RARITIES } from "@/lib/types";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scouting is a *buying* tool, so it only offers the rarities actually played
 * — unlike the gallery, which must keep showing whatever is already owned.
 */
const RARITIES: readonly string[] = TRACKED_RARITIES;

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const league = searchParams.get("league");
  const player = searchParams.get("player");
  const rarityParam = searchParams.get("rarity") ?? "limited";

  // One player's prices and recency — the UI's progressive fill, called once
  // per row after the list has already rendered.
  if (player) {
    if (!RARITIES.includes(rarityParam)) throw new ApiError(`Rareté inconnue : ${rarityParam}`);
    return NextResponse.json(await scoutPlayerContext(player, rarityParam));
  }

  // No league means "what can I scout?" — used to populate the picker.
  if (!league) return NextResponse.json({ leagues: await listLeagues() });

  const rarity = rarityParam;
  if (!RARITIES.includes(rarity)) throw new ApiError(`Rareté inconnue : ${rarity}`);

  // Hard cap at 15: each player carries two price lookups, and measured against
  // the live API, 20 players scores 501 complexity against the unauthenticated
  // limit of 500. An API key raises that to 30000, at which point this can grow.
  const limit = Math.min(15, Math.max(5, Number(searchParams.get("limit") ?? 15)));

  // Default to the fast pass: the list without prices comes back in a couple
  // of seconds, where enriching it inline takes the best part of a minute
  // during which the screen shows nothing at all.
  const enrich = searchParams.get("enrich") === "1";

  return NextResponse.json(await scoutLeague(league, rarity, limit, enrich));
});
