import { NextRequest, NextResponse } from "next/server";
import { buyAdvice } from "@/lib/services/buyAdvice";
import { currentFixture } from "@/lib/services/squadView";
import { getFunds } from "@/lib/services/divisions";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * What to buy next, from the players on the watchlist.
 *
 * The balance is fetched separately and never fatally: signed out, the ranking
 * is still worth showing — it just cannot say what is affordable, and reports
 * that as unknown rather than hiding options.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const fixture = new URL(req.url).searchParams.get("fixture") ?? (await currentFixture());
  const funds = await getFunds().catch(() => null);
  return NextResponse.json(await buyAdvice(fixture, funds?.totalEur ?? null));
});
