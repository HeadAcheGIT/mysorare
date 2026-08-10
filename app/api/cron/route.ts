import { NextRequest, NextResponse } from "next/server";
import { syncSquadAndFixtures, syncFormBatch, recomputeProjections, FORM_BATCH_SIZE } from "@/lib/services/sync";
import { config } from "@/lib/config";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Fired daily by Vercel Cron (see vercel.json — Hobby caps cron at once a
 * day, and only guarantees the trigger fires sometime within the scheduled
 * hour). One invocation can't process a whole squad's form within the
 * function timeout, so this does squad+fixtures (fast) plus as many form
 * batches as fit in the time budget, then recomputes projections on
 * whatever's been refreshed so far. Tap "Refresh" in the app any time to
 * finish the rest immediately instead of waiting for tomorrow's cron.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = req.headers.get("authorization");
  if (config.cronSecret && auth !== `Bearer ${config.cronSecret}`) {
    throw new ApiError("unauthorized", 401);
  }

  const started = Date.now();
  const budgetMs = 45_000; // leaves headroom under the 60s maxDuration
  const squad = await syncSquadAndFixtures();

  let cursor = 0;
  let batches = 0;
  while (Date.now() - started < budgetMs) {
    const res = await syncFormBatch(cursor);
    batches++;
    if (res.nextCursor === null) {
      cursor = 0;
      break;
    }
    cursor = res.nextCursor;
  }

  if (squad.fixture) await recomputeProjections(squad.fixture);

  return NextResponse.json({
    status: "ok",
    cards: squad.cards,
    fixture: squad.fixture,
    formBatchesRun: batches,
    playersPerBatch: FORM_BATCH_SIZE,
    remainingCursor: cursor,
  });
});
