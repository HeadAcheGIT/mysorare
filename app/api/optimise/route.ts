import { NextRequest, NextResponse } from "next/server";
import { getSquadView } from "@/lib/services/squadView";
import { optimise, type Candidate } from "@/lib/services/optimizer";
import { COMPETITIONS } from "@/lib/services/rules";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.competition !== "string") {
    throw new ApiError("competition requise");
  }

  const rules = COMPETITIONS[body.competition];
  if (!rules) {
    throw new ApiError(`Compétition inconnue '${body.competition}'. Ajoute-la dans lib/services/rules.ts.`, 404);
  }

  const data = await getSquadView(body.fixture ?? null, null);
  const candidates: Candidate[] = data.cards
    .filter((c) => !c.excluded)
    .map((c) => ({
      cardSlug: c.cardSlug,
      playerSlug: c.playerSlug,
      playerName: c.name,
      position: c.position,
      rarity: c.rarity,
      clubSlug: c.clubSlug,
      inSeason: c.inSeason,
      expected: c.expected ?? 0,
      pStart: c.pStart ?? 0,
      l15: c.l15,
      bonus: c.bonus,
    }));

  const sol = optimise(candidates, rules, body.locked ?? [], body.banned ?? []);
  if (sol.infeasibleReason) {
    return NextResponse.json({ fixture: data.fixture, competition: body.competition, error: sol.infeasibleReason, cards: [] });
  }

  return NextResponse.json({
    fixture: data.fixture,
    competition: body.competition,
    projectedTotal: sol.total,
    captain: sol.captain,
    cards: sol.cards.map((c) => ({
      cardSlug: c.cardSlug,
      name: c.playerName,
      position: c.position,
      club: c.clubSlug,
      expected: Math.round(c.expected * 10) / 10,
      pStart: c.pStart,
      l15: c.l15,
      isCaptain: c.isCaptain,
    })),
  });
});
