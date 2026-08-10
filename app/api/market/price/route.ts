import { NextRequest, NextResponse } from "next/server";
import { getPlayerMarket } from "@/lib/services/market";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  try {
    return NextResponse.json(await getPlayerMarket(slug));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
