import { NextRequest, NextResponse } from "next/server";
import { syncFormBatch } from "@/lib/services/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Processes one batch of players' form and returns a cursor for the next
 * call. The mobile UI's "Refresh" button loops this until nextCursor is
 * null — that loop is what actually completes a full sync, since a single
 * serverless invocation can't fit a whole squad's worth of API calls.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cursor = Number(body.cursor ?? 0);
  try {
    const result = await syncFormBatch(cursor);
    return NextResponse.json({ status: "ok", ...result });
  } catch (err) {
    return NextResponse.json({ status: "error", detail: (err as Error).message }, { status: 500 });
  }
}
