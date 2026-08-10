import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const rows = await prisma.fixture.findMany({ orderBy: { startDate: "desc" } });
  return NextResponse.json(rows);
});
