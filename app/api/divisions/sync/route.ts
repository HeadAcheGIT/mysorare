import { NextRequest, NextResponse } from "next/server";
import { syncDivisions } from "@/lib/services/divisions";
import { syncAlignedLineups } from "@/lib/services/alignedLineups";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * User-triggered refresh behind the board's "Actualiser" button. Pulls the
 * division structure and the line-ups entered in it together, since a board
 * showing fresh divisions against stale line-ups would be worse than either
 * alone. Requires being signed in to Sorare in-app.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const fixture = typeof body?.fixture === "string" ? body.fixture : null;
  if (!fixture) throw new ApiError("fixture requis");

  const divisions = await syncDivisions(fixture);
  const lineups = await syncAlignedLineups([fixture]);

  return NextResponse.json({ ...divisions, lineupRows: lineups.rows });
});
