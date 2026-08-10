import { NextRequest, NextResponse } from "next/server";
import { recomputeProjections } from "@/lib/services/sync";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

/** Pure local maths, no Sorare calls — instant, safe to run after every override edit. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body?.fixture) throw new ApiError("fixture requise");
  const updated = await recomputeProjections(body.fixture);
  return NextResponse.json({ updated });
});
