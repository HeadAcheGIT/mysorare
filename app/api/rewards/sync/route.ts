import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncRewards } from "@/lib/services/rewards";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** How far back to reach on a full sync — a season's worth of recent game weeks. */
const BACKFILL_COUNT = 20;

/**
 * Pulls rankings and settled rewards. User-triggered and authenticated: this
 * is account-specific money, and a stale Sorare session should fail here
 * rather than silently report zero earnings.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const fixture = typeof body?.fixture === "string" ? body.fixture : null;

  const slugs = new Set<string>();
  if (fixture) slugs.add(fixture);
  else {
    // Past fixtures first: a game week that hasn't been played can't have paid
    // anything, so syncing it would only spend requests.
    const recent = await prisma.fixture.findMany({
      where: { startDate: { lte: new Date() } },
      orderBy: { startDate: "desc" },
      take: BACKFILL_COUNT,
      select: { slug: true },
    });
    for (const f of recent) slugs.add(f.slug);
  }
  if (!slugs.size) throw new ApiError("Aucune game week connue — actualise d'abord la game week dans Données.");

  return NextResponse.json(await syncRewards([...slugs]));
});
