import { NextRequest, NextResponse } from "next/server";
import { getSquadView } from "@/lib/services/squadView";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const data = await getSquadView(searchParams.get("fixture"), searchParams.get("rarity"));
  return NextResponse.json(data);
});
