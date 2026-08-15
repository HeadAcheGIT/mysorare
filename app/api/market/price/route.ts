import { NextRequest, NextResponse } from "next/server";
import { getPlayerMarket, getPlayerValuation } from "@/lib/services/market";
import { ALL_RARITIES } from "@/lib/types";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) throw new ApiError("slug requis");

  // With a rarity in hand (the gallery always knows the card's), the answer
  // includes what those cards have actually sold for — not just what someone
  // is asking. The two disagreed by 38% on the case that prompted this.
  //
  // Any rarity is accepted here, not just the shopped-for ones: this is how a
  // card already owned gets priced, and refusing an owned rare card would
  // leave it permanently without a value.
  const rarity = searchParams.get("rarity");
  if (!rarity) return NextResponse.json(await getPlayerMarket(slug));
  if (!(ALL_RARITIES as readonly string[]).includes(rarity)) {
    throw new ApiError(`Rareté inconnue : ${rarity}`);
  }

  const [floors, valuation] = await Promise.all([
    // Just this rarity: the caller named the card it's pricing.
    getPlayerMarket(slug, [rarity]),
    // Non-fatal: a player with no sale history still deserves his floors.
    getPlayerValuation(slug, rarity).catch(() => null),
  ]);

  return NextResponse.json({ ...floors, valuation });
});
