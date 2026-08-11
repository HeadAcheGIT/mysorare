import { NextRequest, NextResponse } from "next/server";
import { searchPlayerNews } from "@/lib/services/news";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");
  if (!name) throw new ApiError("name requis");

  // Exact-phrase match on the full name is what keeps results on-topic —
  // an unquoted search for a common first/last name pulls in unrelated people.
  const items = await searchPlayerNews(`"${name}"`);
  return NextResponse.json({ items });
});
