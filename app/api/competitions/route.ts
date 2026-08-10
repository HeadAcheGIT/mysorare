import { NextResponse } from "next/server";
import { COMPETITIONS } from "@/lib/services/rules";

export async function GET() {
  const list = Object.values(COMPETITIONS).map((r) => ({
    name: r.name,
    size: r.size,
    rarities: r.rarities,
    l15Cap: r.l15Cap,
    minInSeason: r.minInSeason,
  }));
  return NextResponse.json(list);
}
