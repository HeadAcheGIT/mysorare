import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

/**
 * Manual seal toggle for one card (see lib/sealAdvice.ts for why this is
 * manual rather than synced: Sorare's Vault/sealing state isn't exposed on
 * the schema this app already talks to).
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.cardSlug !== "string" || !body.cardSlug) {
    throw new ApiError("cardSlug requis");
  }

  const card = await prisma.card.update({
    where: { slug: body.cardSlug },
    data: { sealedAt: body.sealed ? new Date() : null },
  });

  return NextResponse.json({ status: "saved", sealedAt: card.sealedAt?.toISOString() ?? null });
});
