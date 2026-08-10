import { NextRequest, NextResponse } from "next/server";
import { searchPlayers } from "@/lib/services/market";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q || q.trim().length < 2) return NextResponse.json([]);
  try {
    return NextResponse.json(await searchPlayers(q.trim()));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
