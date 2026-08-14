import { NextResponse } from "next/server";
import { getFunds } from "@/lib/services/divisions";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

/**
 * Spendable Sorare balance, for the in-season advisor. Requires being signed
 * in in-app; the advisor treats a failure here as "budget unknown" and falls
 * back to the manually entered one rather than blocking.
 */
export const GET = withErrorHandling(async () => {
  return NextResponse.json(await getFunds());
});
