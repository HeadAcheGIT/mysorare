import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.watchlistItem.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
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
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const playerSlug = searchParams.get("playerSlug");
  if (!playerSlug) return NextResponse.json({ error: "playerSlug required" }, { status: 400 });
  await prisma.watchlistItem.delete({ where: { playerSlug } }).catch(() => null);
  return NextResponse.json({ status: "removed" });
}
