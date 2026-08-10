import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const rows = await prisma.watchlistItem.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(rows);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.playerSlug !== "string" || typeof body.label !== "string") {
    throw new ApiError("playerSlug et label requis");
  }
  await prisma.watchlistItem.upsert({
    where: { playerSlug: body.playerSlug },
    create: {
      playerSlug: body.playerSlug,
      label: body.label,
      position: body.position ?? null,
      club: body.club ?? null,
    },
    update: { label: body.label, position: body.position ?? null, club: body.club ?? null },
  });
  return NextResponse.json({ status: "saved" });
});

export const DELETE = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const playerSlug = searchParams.get("playerSlug");
  if (!playerSlug) throw new ApiError("playerSlug requis");
  await prisma.watchlistItem.delete({ where: { playerSlug } }).catch(() => null);
  return NextResponse.json({ status: "removed" });
});
