import { NextRequest, NextResponse } from "next/server";
import { recomputeProjections } from "@/lib/services/sync";

export const dynamic = "force-dynamic";

/** Pure local maths, no Sorare calls — instant, safe to run after every override edit. */
export async function POST(req: NextRequest) {
  const { fixture } = await req.json();
  if (!fixture) return NextResponse.json({ error: "fixture required" }, { status: 400 });
  const updated = await recomputeProjections(fixture);
  return NextResponse.json({ updated });
}
