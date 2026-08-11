import { NextResponse } from "next/server";
import { syncClubFriendlies } from "@/lib/services/friendlies";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * User-triggered only. Costs API-Football requests (100/day free tier), so
 * it's deliberately not on the daily cron — see lib/services/friendlies.ts.
 */
export const POST = withErrorHandling(async () => {
  return NextResponse.json(await syncClubFriendlies());
});
