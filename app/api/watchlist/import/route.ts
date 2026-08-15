import { NextResponse } from "next/server";
import { importSorareWatchlists } from "@/lib/services/watchlistImport";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Imports the manager's Sorare watchlists into the app's own lists.
 *
 * Authenticated: `currentUser.myWatchlists` is personal data, so this needs a
 * Sorare session (JWT or Sorare Connect). One request covers every list —
 * neither `myWatchlists` nor `playersPanel` paginates.
 */
export const POST = withErrorHandling(async () => {
  return NextResponse.json({ status: "ok", ...(await importSorareWatchlists()) });
});
