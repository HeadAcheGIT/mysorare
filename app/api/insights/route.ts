import { NextRequest, NextResponse } from "next/server";
import { buildInsights, portfolioSummary } from "@/lib/services/insights";
import { currentFixture } from "@/lib/services/squadView";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const fixture = searchParams.get("fixture") ?? (await currentFixture());
  const [insights, summary] = await Promise.all([buildInsights(fixture), portfolioSummary()]);
  return NextResponse.json({
    fixture,
    summary,
    groups: insights.groups,
    // Cards whose player has never been enriched. Surfaced so the UI can say
    // the analysis is partial instead of quietly leaving them out.
    unenriched: insights.unenriched,
  });
});
