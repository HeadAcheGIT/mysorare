import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

/** Every group with its items, ordered so the oldest (default) list comes first. */
export const GET = withErrorHandling(async () => {
  const groups = await prisma.watchlistGroup.findMany({
    orderBy: { id: "asc" },
    include: { items: { orderBy: { createdAt: "desc" } } },
  });
  return NextResponse.json(groups);
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
