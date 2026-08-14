import { NextRequest, NextResponse } from "next/server";
import { proposeForDivision } from "@/lib/services/divisionLineup";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Everything the board needs when a division is opened, in one call: the real
 * eligible bench, the best line-up available from it, what switching to it
 * would gain, and Sorare's own verdict on that line-up.
 *
 * Fetched per division rather than for the whole game week — a game week
 * exposes ~76 leaderboards, so loading every bench up front would be both slow
 * and mostly wasted.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const leaderboard = searchParams.get("leaderboard");
  const fixture = searchParams.get("fixture");
  if (!leaderboard) throw new ApiError("leaderboard requis");
  if (!fixture) throw new ApiError("fixture requis");

  // Opt-out so the board can stay responsive if the extra preview round trip
  // ever becomes the slow part.
  const validate = searchParams.get("validate") !== "0";

  return NextResponse.json(await proposeForDivision(leaderboard, fixture, { validate }));
});
