import { NextRequest, NextResponse } from "next/server";
import { getPlayerMarket, getPlayerValuation } from "@/lib/services/market";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RARITIES = ["common", "limited", "rare", "super_rare", "unique"];

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) throw new ApiError("slug requis");

  // With a rarity in hand (the gallery always knows the card's), the answer
  // includes what those cards have actually sold for — not just what someone
  // is asking. The two disagreed by 38% on the case that prompted this.
  const rarity = searchParams.get("rarity");
  if (!rarity) return NextResponse.json(await getPlayerMarket(slug));
  if (!RARITIES.includes(rarity)) throw new ApiError(`Rareté inconnue : ${rarity}`);

  const [floors, valuation] = await Promise.all([
    getPlayerMarket(slug),
    // Non-fatal: a player with no sale history still deserves his floors.
    getPlayerValuation(slug, rarity).catch(() => null),
  ]);

  return NextResponse.json({ ...floors, valuation });
});
