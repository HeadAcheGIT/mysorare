import { NextResponse } from "next/server";
import { COMPETITIONS } from "@/lib/services/rules";
import { withErrorHandling } from "@/lib/apiHandler";

export const GET = withErrorHandling(async () => {
  const list = Object.values(COMPETITIONS).map((r) => ({
    name: r.name,
    size: r.size,
    rarities: r.rarities,
    l15Cap: r.l15Cap,
    minInSeason: r.minInSeason,
  }));
  return NextResponse.json(list);
});
