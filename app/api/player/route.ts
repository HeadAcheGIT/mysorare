import { NextRequest, NextResponse } from "next/server";
import { getPlayerDetail } from "@/lib/services/playerDetail";
import { friendliesForPlayer } from "@/lib/services/friendlies";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) throw new ApiError("slug requis");

  // Club friendlies live in our own Appearance table (API-Football), not in
  // Sorare's game feed — see lib/services/friendlies.ts. Non-fatal: a player
  // with no synced friendlies just gets an empty list.
  const [detail, friendlies] = await Promise.all([
    getPlayerDetail(slug),
    friendliesForPlayer(slug).catch(() => []),
  ]);
  if (!detail) throw new ApiError(`Joueur introuvable : ${slug}`, 404);
  return NextResponse.json({ ...detail, friendlies });
});
