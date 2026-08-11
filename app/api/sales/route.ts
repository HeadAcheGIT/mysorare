import { NextResponse } from "next/server";
import { listSales } from "@/lib/services/sales";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = withErrorHandling(async () => {
  return NextResponse.json(await listSales());
});
