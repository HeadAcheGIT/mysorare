import { NextRequest, NextResponse } from "next/server";
import { listDivisions } from "@/lib/services/divisions";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

/** The account's real league tracks and divisions for one game week, with what's aligned in each. */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const fixture = searchParams.get("fixture");
  if (!fixture) throw new ApiError("fixture requis");

  return NextResponse.json({ fixture, tracks: await listDivisions(fixture) });
});
