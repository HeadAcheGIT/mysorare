import { NextResponse } from "next/server";
import { buildMercatoSignals } from "@/lib/services/mercato";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

/**
 * Situational signals (starting-time trend, form trend) for the Mercato tab —
 * DB-only, no Sorare call, safe to load on every app open alongside
 * /api/alerts. The transfer-rumor half of the tab reuses /api/alerts
 * directly rather than duplicating it here.
 */
export const GET = withErrorHandling(async () => {
  return NextResponse.json(await buildMercatoSignals());
});
