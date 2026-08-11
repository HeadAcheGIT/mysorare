import { NextRequest, NextResponse } from "next/server";
import { getPlayerDetail } from "@/lib/services/playerDetail";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) throw new ApiError("slug requis");

  const detail = await getPlayerDetail(slug);
  if (!detail) throw new ApiError(`Joueur introuvable : ${slug}`, 404);
  return NextResponse.json(detail);
});
