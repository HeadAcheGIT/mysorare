import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncAlignedLineups } from "@/lib/services/alignedLineups";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BACKFILL_COUNT = 15;

/**
 * User-triggered refresh — the "match my Sorare data exactly" button on the
 * GW board. A single fixture is fast enough for the button's own request;
 * `backfill` additionally pulls the most recent closed fixtures, for the
 * one-time initial rollout where there isn't enough history yet to grade
 * either probability source. Requires being signed in to Sorare in-app.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const fixture = typeof body?.fixture === "string" ? body.fixture : null;
  const backfill = Boolean(body?.backfill);

  const slugs = new Set<string>();
  if (fixture) slugs.add(fixture);
  if (backfill) {
    const recent = await prisma.fixture.findMany({
      orderBy: { startDate: "desc" },
      take: BACKFILL_COUNT,
      select: { slug: true },
    });
    for (const f of recent) slugs.add(f.slug);
  }
  if (!slugs.size) throw new ApiError("fixture ou backfill requis");

  return NextResponse.json(await syncAlignedLineups([...slugs]));
});
