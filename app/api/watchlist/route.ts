import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

/**
 * Every group with its items, ordered so the oldest (default) list comes
 * first. birthDate/competitionName aren't stored on the watchlist item itself
 * (a transfer would make a stored club/league stale) — joined live from
 * Player/Club instead, same as insights.ts does for its own rows.
 */
export const GET = withErrorHandling(async () => {
  const groups = await prisma.watchlistGroup.findMany({
    orderBy: { id: "asc" },
    include: { items: { orderBy: { createdAt: "desc" } } },
  });

  const slugs = groups.flatMap((g) => g.items.map((i) => i.playerSlug));
  const players = await prisma.player.findMany({
    where: { slug: { in: slugs } },
    include: { club: true },
  });
  const playerMap = new Map(players.map((p) => [p.slug, p]));

  return NextResponse.json(
    groups.map((g) => ({
      ...g,
      items: g.items.map((i) => {
        const p = playerMap.get(i.playerSlug);
        return {
          ...i,
          birthDate: p?.birthDate?.toISOString() ?? null,
          competitionName: p?.club?.competitionName ?? null,
        };
      }),
    }))
  );
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.playerSlug !== "string" || typeof body.label !== "string") {
    throw new ApiError("playerSlug et label requis");
  }
  const groupId = await resolveGroupId(body.groupId);

  await prisma.watchlistItem.upsert({
    where: { playerSlug_groupId: { playerSlug: body.playerSlug, groupId } },
    create: {
      playerSlug: body.playerSlug,
      label: body.label,
      position: body.position ?? null,
      club: body.club ?? null,
      groupId,
    },
    update: { label: body.label, position: body.position ?? null, club: body.club ?? null },
  });
  return NextResponse.json({ status: "saved" });
});

export const DELETE = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const playerSlug = searchParams.get("playerSlug");
  const groupId = searchParams.get("groupId");
  if (!playerSlug || !groupId) throw new ApiError("playerSlug et groupId requis");
  await prisma.watchlistItem
    .delete({ where: { playerSlug_groupId: { playerSlug, groupId: Number(groupId) } } })
    .catch(() => null);
  return NextResponse.json({ status: "removed" });
});

/** Falls back to the default ("Général") group when the caller doesn't pick one. */
async function resolveGroupId(requested: unknown): Promise<number> {
  if (typeof requested === "number") return requested;
  const first = await prisma.watchlistGroup.findFirst({ orderBy: { id: "asc" } });
  if (first) return first.id;
  const created = await prisma.watchlistGroup.create({ data: { name: "Général" } });
  return created.id;
}
