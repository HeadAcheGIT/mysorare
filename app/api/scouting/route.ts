import { NextRequest, NextResponse } from "next/server";
import { listLeagues, scoutLeague } from "@/lib/services/scouting";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RARITIES = ["common", "limited", "rare", "super_rare", "unique"];

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const league = searchParams.get("league");

  // No league means "what can I scout?" — used to populate the picker.
  if (!league) return NextResponse.json({ leagues: await listLeagues() });

  const rarity = searchParams.get("rarity") ?? "limited";
  if (!RARITIES.includes(rarity)) throw new ApiError(`Rareté inconnue : ${rarity}`);

  // Hard cap at 15: each player carries two price lookups, and measured against
  // the live API, 20 players scores 501 complexity against the unauthenticated
  // limit of 500. An API key raises that to 30000, at which point this can grow.
  const limit = Math.min(15, Math.max(5, Number(searchParams.get("limit") ?? 15)));

  return NextResponse.json(await scoutLeague(league, rarity, limit));
});
