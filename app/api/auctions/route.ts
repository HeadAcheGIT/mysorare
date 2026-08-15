import { NextResponse } from "next/server";
import { watchedAuctions } from "@/lib/services/auctions";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Live auctions on watchlisted players, priced against what those cards
 * actually trade at. No Sorare login needed.
 */
export const GET = withErrorHandling(async () => {
  return NextResponse.json(await watchedAuctions());
});
