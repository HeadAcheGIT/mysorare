import { NextRequest, NextResponse } from "next/server";
import { getPlayerMarket } from "@/lib/services/market";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) throw new ApiError("slug requis");
  return NextResponse.json(await getPlayerMarket(slug));
});
