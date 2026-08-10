import { NextRequest, NextResponse } from "next/server";
import { enrichBatch, ENRICH_BATCH_SIZE } from "@/lib/services/enrich";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One batch of players per call; the client loops until nextCursor is null. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const result = await enrichBatch(Number(body.cursor ?? 0));
  return NextResponse.json({ status: "ok", batchSize: ENRICH_BATCH_SIZE, ...result });
});
