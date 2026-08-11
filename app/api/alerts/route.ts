import { NextResponse } from "next/server";
import { getAlertsBySlug } from "@/lib/services/alerts";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const map = await getAlertsBySlug();
  return NextResponse.json(Object.fromEntries(map));
});
