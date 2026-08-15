import { NextRequest, NextResponse } from "next/server";
import { syncAcquisitionsBatch } from "@/lib/services/acquisition";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Fills in what each card actually cost, from the public ownership record.
 * Batched with a cursor like the other long syncs — the client loops until
 * nextCursor is null. No Sorare login needed.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const cursor = Number(body?.cursor ?? 0);
  return NextResponse.json(await syncAcquisitionsBatch(Number.isFinite(cursor) ? cursor : 0));
});
