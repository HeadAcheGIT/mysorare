import { NextResponse } from "next/server";
import { seasonSummary } from "@/lib/services/rewards";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

/** What the season has actually returned, against what the gallery cost. */
export const GET = withErrorHandling(async () => {
  return NextResponse.json(await seasonSummary());
});
