import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 20);
  const rows = await prisma.syncLog.findMany({ orderBy: { ranAt: "desc" }, take: limit });
  return NextResponse.json(rows);
}
