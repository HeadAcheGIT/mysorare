import { NextRequest, NextResponse } from "next/server";
import { searchPlayers } from "@/lib/services/market";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q || q.trim().length < 2) return NextResponse.json([]);
  return NextResponse.json(await searchPlayers(q.trim()));
});
