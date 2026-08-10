import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.fixture.findMany({ orderBy: { startDate: "desc" } });
  return NextResponse.json(rows);
}
