import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  await prisma.savedLineup.create({
    data: {
      fixtureSlug: body.fixture,
      competition: body.competition,
      cardSlugs: (body.cardSlugs as string[]).join(","),
      captainSlug: body.captain ?? null,
      projectedTotal: body.projectedTotal ?? 0,
    },
  });
  return NextResponse.json({ status: "saved" });
}
