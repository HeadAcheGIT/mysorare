import { NextResponse } from "next/server";
import { syncValuationsBatch } from "@/lib/services/valuationSync";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Revalues one slice of the gallery and reports what's left.
 *
 * Sliced rather than done in one pass because a valuation is one un-batchable
 * Sorare request paced at ~3.2 s: a full gallery exceeds any single serverless
 * invocation. The caller loops while `remaining` is above zero — the same
 * shape as /api/sync/batch.
 */
export const POST = withErrorHandling(async () => {
  return NextResponse.json({ status: "ok", ...(await syncValuationsBatch()) });
});
