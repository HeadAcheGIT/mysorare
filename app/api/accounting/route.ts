import { NextRequest, NextResponse } from "next/server";
import { accountingSummary, compositionsFor, importAccountingCsv } from "@/lib/services/accounting";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * How fresh the ledger is and what it adds up to, or — with `?slugs=` — the
 * wallet/credit split for those cards.
 *
 * One route rather than two: both answers come from the same table, and the
 * history screen wants them in the same breath.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const slugs = new URL(req.url).searchParams.get("slugs");
  if (slugs) {
    const wanted = slugs.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500);
    return NextResponse.json(Object.fromEntries(await compositionsFor(wanted)));
  }
  return NextResponse.json(await accountingSummary());
});

/**
 * Imports a Sorare accounting export.
 *
 * Idempotent: each row's id is a hash of its own fields, so re-importing an
 * export that overlaps the previous one adds only what is new instead of
 * doubling every movement.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const text = await req.text();
  if (!text.trim()) throw new ApiError("Fichier vide");
  if (!/entry_type/i.test(text)) {
    throw new ApiError(
      "Ce fichier ne ressemble pas à l'export comptable Sorare (colonne « entry_type » absente)."
    );
  }
  return NextResponse.json({ status: "ok", ...(await importAccountingCsv(text)) });
});
