import { NextRequest, NextResponse } from "next/server";
import { getPlayerDetail } from "@/lib/services/playerDetail";
import { friendliesForPlayer, friendliesStatus } from "@/lib/services/friendlies";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) throw new ApiError("slug requis");

  // Club friendlies live in our own Appearance table (API-Football), not in
  // Sorare's game feed — see lib/services/friendlies.ts. Non-fatal: a player
  // with no synced friendlies just gets an empty list, and `friendliesStatus`
  // tells the UI whether that means "none for him" or "never synced", which
  // an empty list alone can't distinguish.
  const [detail, friendlies, status, priceSnapshots] = await Promise.all([
    getPlayerDetail(slug),
    friendliesForPlayer(slug).catch(() => []),
    friendliesStatus().catch(() => "ok" as const),
    prisma.priceSnapshot
      .findMany({
        where: { playerSlug: slug },
        orderBy: { capturedAt: "asc" },
        take: 90,
        select: { rarity: true, floorPrice: true, capturedAt: true },
      })
      .catch(() => []),
  ]);
  if (!detail) throw new ApiError(`Joueur introuvable : ${slug}`, 404);
  return NextResponse.json({ ...detail, friendlies, friendliesStatus: status, priceSnapshots });
});

