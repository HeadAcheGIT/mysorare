import { NextRequest, NextResponse } from "next/server";
import { alignedLineupComparison, overallAccuracy, summarizeAccuracy } from "@/lib/services/alignedLineups";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

/** Per-division comparison (aligned card, our %, Sorare+partner %, real outcome) for one fixture, plus the running accuracy scorecard. */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);

  // No fixture means "how good is this model overall". One game week is five
  // cards, where a single rotation swings the hit rate by 20 points — a
  // calibration figure only means something once it accumulates.
  if (searchParams.get("all") === "1") return NextResponse.json(await overallAccuracy());

  const fixture = searchParams.get("fixture");
  if (!fixture) throw new ApiError("fixture requis");

  const groups = await alignedLineupComparison(fixture);
  const accuracy = summarizeAccuracy(groups.flatMap((g) => g.rows));

  return NextResponse.json({ fixture, groups, accuracy });
});
