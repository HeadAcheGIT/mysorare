import { NextRequest, NextResponse } from "next/server";
import { getSquadView } from "@/lib/services/squadView";
import { cardsInLineups } from "@/lib/services/divisionLineup";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const [data, engaged] = await Promise.all([
    getSquadView(searchParams.get("fixture"), searchParams.get("rarity")),
    // Which cards are already committed to a line-up. Authenticated, so a
    // signed-out session simply leaves every card unflagged rather than
    // taking the gallery — the app's main screen — down with it.
    cardsInLineups().catch(() => new Set<string>()),
  ]);

  return NextResponse.json({
    ...data,
    cards: data.cards.map((c) => ({ ...c, engagedInLineup: engaged.has(c.cardSlug) })),
  });
});
