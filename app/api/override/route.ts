import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function currentFixture(): Promise<string | null> {
  const row = await prisma.fixture.findFirst({ orderBy: { startDate: "desc" } });
  return row?.slug ?? null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const fixture: string = body.fixture ?? (await currentFixture());
  if (!fixture) return NextResponse.json({ error: "No fixture known yet — sync first" }, { status: 400 });

  await prisma.override.upsert({
    where: { playerSlug_fixtureSlug: { playerSlug: body.playerSlug, fixtureSlug: fixture } },
    create: {
      playerSlug: body.playerSlug,
      fixtureSlug: fixture,
      pStart: body.pStart ?? null,
      expectedScore: body.expectedScore ?? null,
      exclude: Boolean(body.exclude),
      note: body.note ?? null,
    },
    update: {
      pStart: body.pStart ?? null,
      expectedScore: body.expectedScore ?? null,
      exclude: Boolean(body.exclude),
      note: body.note ?? null,
    },
  });
  return NextResponse.json({ status: "saved" });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const playerSlug = searchParams.get("playerSlug");
  const fixture = searchParams.get("fixture") ?? (await currentFixture());
  if (!playerSlug || !fixture) return NextResponse.json({ error: "playerSlug and fixture required" }, { status: 400 });

  await prisma.override
    .delete({ where: { playerSlug_fixtureSlug: { playerSlug, fixtureSlug: fixture } } })
    .catch(() => null);
  return NextResponse.json({ status: "cleared" });
}
