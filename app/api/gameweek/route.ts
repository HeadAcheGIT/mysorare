import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncFixtures, recomputeFromPublic } from "@/lib/services/gameweek";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Current game week plus the deadline the UI counts down to. */
export const GET = withErrorHandling(async () => {
  const now = new Date();
  const upcoming = await prisma.fixture.findFirst({
    where: { cutOffDate: { gt: now } },
    orderBy: { cutOffDate: "asc" },
  });
  const fallback = upcoming ?? (await prisma.fixture.findFirst({ orderBy: { startDate: "desc" } }));

  return NextResponse.json({
    fixture: fallback?.slug ?? null,
    displayName: fallback?.displayName ?? null,
    gameWeek: fallback?.gameWeek ?? null,
    cutOffDate: fallback?.cutOffDate ?? null,
    startDate: fallback?.startDate ?? null,
    locked: fallback?.cutOffDate ? fallback.cutOffDate <= now : null,
  });
});

/**
 * Refreshes the game-week list from the public API, then recomputes every
 * projection against the one still open. Both halves are cheap: one GraphQL
 * call, then pure local maths.
 */
export const POST = withErrorHandling(async () => {
  const fixture = await syncFixtures();
  const updated = fixture ? await recomputeFromPublic(fixture) : 0;
  return NextResponse.json({ status: "ok", fixture, updated });
});
