import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const fixture = searchParams.get("fixture");
  const rows = await prisma.savedLineup.findMany({
    where: fixture ? { fixtureSlug: fixture } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(
    rows.map((l) => ({
      id: l.id,
      fixture: l.fixtureSlug,
      competition: l.competition,
      cards: l.cardSlugs.split(","),
      captain: l.captainSlug,
      projectedTotal: l.projectedTotal,
      createdAt: l.createdAt,
    }))
  );
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.fixture !== "string" ||
    typeof body.competition !== "string" ||
    !Array.isArray(body.cardSlugs) ||
    body.cardSlugs.length === 0
  ) {
    throw new ApiError("fixture, competition et cardSlugs (tableau non vide) requis");
  }

  const created = await prisma.savedLineup.create({
    data: {
      fixtureSlug: body.fixture,
      competition: body.competition,
      cardSlugs: (body.cardSlugs as string[]).join(","),
      captainSlug: body.captain ?? null,
      projectedTotal: body.projectedTotal ?? 0,
    },
  });
  return NextResponse.json({ status: "saved", id: created.id });
});

export const DELETE = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) throw new ApiError("id requis");
  await prisma.savedLineup.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ status: "removed" });
});
