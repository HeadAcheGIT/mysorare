import { NextResponse } from "next/server";
import { enrichBatch, ENRICH_BATCH_SIZE } from "@/lib/services/enrich";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One batch per call; the client loops while `remaining` is above zero.
 * Batches are chosen by staleness rather than a cursor, so calling this again
 * after a failure resumes exactly where it left off without the caller having
 * to track anything.
 */
export const POST = withErrorHandling(async () => {
  const result = await enrichBatch();
  return NextResponse.json({ status: "ok", batchSize: ENRICH_BATCH_SIZE, ...result });
});
