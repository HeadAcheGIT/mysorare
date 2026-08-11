import { NextResponse } from "next/server";
import { syncSoldOffersFromSorare } from "@/lib/services/sales";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * User-triggered only — pulls the full sold/bought offer history from
 * Sorare. Requires being signed in in-app (onglet Données); surfaces
 * lib/sorare/auth.ts's own French error message otherwise.
 */
export const POST = withErrorHandling(async () => {
  return NextResponse.json(await syncSoldOffersFromSorare());
});
