import { NextRequest, NextResponse } from "next/server";
import { getSquadView } from "@/lib/services/squadView";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const data = await getSquadView(searchParams.get("fixture"), searchParams.get("rarity"));
  return NextResponse.json(data);
}
