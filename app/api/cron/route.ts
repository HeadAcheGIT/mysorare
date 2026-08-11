import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { enrichBatch } from "@/lib/services/enrich";
import { syncFixtures, recomputeFromPublic } from "@/lib/services/gameweek";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily refresh, fired by Vercel Cron (see vercel.json — Hobby allows one run
 * a day, somewhere inside the scheduled hour).
 *
 * Runs entirely on Sorare's public API: no token, so nothing here can be
 * broken by 2FA re-triggering on a changed IP, which is what made the old
 * authenticated sync unreliable. The gallery itself comes from the CSV import
 * and isn't touched.
 *
 * A full enrichment of a 400-player gallery doesn't fit in one invocation
 * against the 20 req/min unauthenticated limit, so each run advances a cursor
 * and picks up where the last one stopped; projections are recomputed every
 * time on whatever has been refreshed so far.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  // The app-wide Basic Auth middleware deliberately skips this route so Vercel
  // Cron can reach it, making this check the only thing protecting it — so it
  // fails closed when the secret is unset rather than letting anyone trigger a
  // full sync.
  const auth = req.headers.get("authorization");
  if (!config.cronSecret || auth !== `Bearer ${config.cronSecret}`) {
    throw new ApiError("unauthorized", 401);
  }

  const started = Date.now();
  const budgetMs = 40_000; // headroom under maxDuration for the final writes
  const fixture = await syncFixtures();

  // No cursor to carry between runs: enrichBatch always picks the players with
  // the oldest (or missing) data, so consecutive runs converge on their own.
  let processed = 0;
  let remaining = 0;
  let neverEnriched = 0;
  while (Date.now() - started < budgetMs) {
    const res = await enrichBatch();
    processed += res.processed;
    remaining = res.remaining;
    neverEnriched = res.neverEnriched;
    if (res.remaining === 0 || res.processed === 0) break;
  }

  const updated = fixture ? await recomputeFromPublic(fixture) : 0;

  return NextResponse.json({
    status: "ok",
    fixture,
    playersEnriched: processed,
    stillStale: remaining,
    neverEnriched,
    projections: updated,
  });
});
