import { NextResponse } from "next/server";
import { disconnect } from "@/lib/sorare/oauth";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

/** Revokes the token with Sorare and clears the local session. */
export const POST = withErrorHandling(async () => {
  await disconnect();
  return NextResponse.json({ status: "deconnecte" });
});
