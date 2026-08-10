import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { enrichBatch } from "@/lib/services/enrich";
import { syncFixtures, recomputeFromPublic } from "@/lib/services/gameweek";
import { prisma } from "@/lib/prisma";
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

  // Resume from wherever yesterday's run ran out of time.
  const state = await prisma.syncLog.findFirst({
    where: { job: "cron_cursor" },
    orderBy: { ranAt: "desc" },
  });
  let cursor = Number(state?.detail ?? 0) || 0;

  let processed = 0;
  let done = false;
  while (Date.now() - started < budgetMs) {
    const res = await enrichBatch(cursor);
    processed += res.processed;
    if (res.nextCursor === null) {
      cursor = 0;
      done = true;
      break;
    }
    cursor = res.nextCursor;
  }

  await prisma.syncLog.create({ data: { job: "cron_cursor", status: "ok", detail: String(cursor) } });

  const updated = fixture ? await recomputeFromPublic(fixture) : 0;

  return NextResponse.json({
    status: "ok",
    fixture,
    playersEnriched: processed,
    completedFullPass: done,
    resumeCursor: cursor,
    projections: updated,
  });
});
