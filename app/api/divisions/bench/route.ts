import { NextRequest, NextResponse } from "next/server";
import { proposeForDivision, DEFAULT_LINEUP_WEIGHTS, type LineupWeights } from "@/lib/services/divisionLineup";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reads wForm/wTitu/wProj (0-1 each) and normalises them to sum to 1. Absent
 * entirely — the common case, no sliders touched — falls straight through to
 * DEFAULT_LINEUP_WEIGHTS so the proposal is untouched by this feature existing.
 */
function readWeights(searchParams: URLSearchParams): LineupWeights {
  const raw = { form: searchParams.get("wForm"), titu: searchParams.get("wTitu"), proj: searchParams.get("wProj") };
  if (raw.form == null && raw.titu == null && raw.proj == null) return DEFAULT_LINEUP_WEIGHTS;

  const parsed = { form: Number(raw.form ?? 0), titu: Number(raw.titu ?? 0), proj: Number(raw.proj ?? 0) };
  for (const v of Object.values(parsed)) {
    if (!Number.isFinite(v) || v < 0) throw new ApiError("poids de compo invalides");
  }
  const total = parsed.form + parsed.titu + parsed.proj;
  if (total <= 0) return DEFAULT_LINEUP_WEIGHTS;
  return { form: parsed.form / total, titu: parsed.titu / total, proj: parsed.proj / total };
}

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
  const weights = readWeights(searchParams);

  return NextResponse.json(await proposeForDivision(leaderboard, fixture, { validate, weights }));
});
