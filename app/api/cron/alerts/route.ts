import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { runAlerts } from "@/lib/services/alerts";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily price-move / transfer-rumor check for owned + watchlisted players
 * only — kept as its own cron entry (see vercel.json) rather than folded into
 * /api/cron, since that route's enrichment loop already claims most of its
 * 60s budget and the news half of this job is deliberately paced slowly
 * (courtesy feed — see lib/services/news.ts).
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = req.headers.get("authorization");
  if (!config.cronSecret || auth !== `Bearer ${config.cronSecret}`) {
    throw new ApiError("unauthorized", 401);
  }

  const result = await runAlerts(50_000);
  return NextResponse.json({ status: "ok", ...result });
});
