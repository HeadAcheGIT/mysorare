import { NextRequest, NextResponse } from "next/server";
import { debriefFixture } from "@/lib/services/debrief";
import { currentFixture } from "@/lib/services/squadView";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * What a game week's line-ups returned against the best that was available.
 *
 * Needs no Sorare request: the line-ups, the appearances and the cards are all
 * local, and a past game week's bench can't be re-read from the API anyway.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const fixture = new URL(req.url).searchParams.get("fixture") ?? (await currentFixture());
  if (!fixture) throw new ApiError("Aucune game week connue");
  return NextResponse.json(await debriefFixture(fixture));
});
