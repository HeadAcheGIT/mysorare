import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

async function currentFixture(): Promise<string | null> {
  const row = await prisma.fixture.findFirst({ orderBy: { startDate: "desc" } });
  return row?.slug ?? null;
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.playerSlug !== "string" || !body.playerSlug) {
    throw new ApiError("playerSlug requis");
  }

  const fixture: string = body.fixture ?? (await currentFixture());
  if (!fixture) throw new ApiError("Aucune game week connue — lance une synchro d'abord");

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
});

export const DELETE = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const playerSlug = searchParams.get("playerSlug");
  const fixture = searchParams.get("fixture") ?? (await currentFixture());
  if (!playerSlug || !fixture) throw new ApiError("playerSlug et fixture requis");

  await prisma.override
    .delete({ where: { playerSlug_fixtureSlug: { playerSlug, fixtureSlug: fixture } } })
    .catch(() => null);
  return NextResponse.json({ status: "cleared" });
});
