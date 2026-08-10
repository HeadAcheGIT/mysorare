import { NextRequest, NextResponse } from "next/server";
import { importGalleryCsv } from "@/lib/services/csvImport";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Takes the raw CSV as the request body — no multipart parsing needed. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const text = await req.text();
  if (!text.trim()) throw new ApiError("Fichier vide.");
  const result = await importGalleryCsv(text);
  return NextResponse.json({ status: "ok", ...result });
});
