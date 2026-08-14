import { NextRequest, NextResponse } from "next/server";
import { buildAdvice } from "@/lib/services/divisionAdvisor";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

/**
 * Ranked in-season divisions: what you can already play, what you're short
 * of, roughly what closing that gap costs, and whether your balance covers
 * it. `budget` overrides the Sorare balance when the real buying budget sits
 * elsewhere.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const fixture = searchParams.get("fixture");
  if (!fixture) throw new ApiError("fixture requis");

  const raw = searchParams.get("budget");
  let budgetOverrideEur: number | null = null;
  if (raw != null && raw !== "") {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) throw new ApiError("budget invalide");
    budgetOverrideEur = parsed;
  }

  return NextResponse.json(await buildAdvice(fixture, { budgetOverrideEur }));
});
