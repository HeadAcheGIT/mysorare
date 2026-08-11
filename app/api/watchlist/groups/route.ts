import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) throw new ApiError("Nom de liste requis");
  const group = await prisma.watchlistGroup.create({ data: { name } });
  return NextResponse.json(group);
});

export const DELETE = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) throw new ApiError("id requis");

  const remaining = await prisma.watchlistGroup.count();
  if (remaining <= 1) throw new ApiError("Impossible de supprimer la dernière liste");

  await prisma.watchlistGroup.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ status: "removed" });
});
