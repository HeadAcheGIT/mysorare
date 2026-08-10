import { NextRequest, NextResponse } from "next/server";
import { checkConfirmedLineups, recomputeProjections } from "@/lib/services/sync";
import { currentFixture } from "@/lib/services/squadView";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Only useful roughly 90 minutes to kickoff — see apiFootball.ts. Call this
 * yourself right before your Sorare line-up locks, not as part of the daily
 * cron (Hobby's once-a-day schedule can't land in that window reliably).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cursor = Number(body.cursor ?? 0);
  try {
    const result = await checkConfirmedLineups(cursor);
    if (result.nextCursor === null) {
      const fixture = await currentFixture();
      if (fixture) await recomputeProjections(fixture);
    }
    return NextResponse.json({ status: "ok", ...result });
  } catch (err) {
    return NextResponse.json({ status: "error", detail: (err as Error).message }, { status: 500 });
  }
}
