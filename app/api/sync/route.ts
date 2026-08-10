import { NextResponse } from "next/server";
import { syncSquadAndFixtures } from "@/lib/services/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds — raise via Vercel plan if your squad's card pagination needs it

export async function POST() {
  try {
    const result = await syncSquadAndFixtures();
    return NextResponse.json({ status: "ok", ...result });
  } catch (err) {
    return NextResponse.json({ status: "error", detail: (err as Error).message }, { status: 500 });
  }
}
