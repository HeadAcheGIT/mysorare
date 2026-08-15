import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/sorare/oauth";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sends the user back to the app with a readable outcome rather than raw JSON. */
function back(origin: string, params: Record<string, string>) {
  const url = new URL("/", origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.delete("sorare_oauth_state");
  return res;
}

/**
 * Where Sorare sends the user back after consent. Verifies the state cookie
 * before touching the code — a callback that doesn't match a sign-in this
 * browser started is exactly the attack the state exists to stop.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  if (denied) return back(origin, { sorare: "refuse" });

  const expected = req.cookies.get("sorare_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) {
    return back(origin, { sorare: "invalide" });
  }

  try {
    await exchangeCode(code, origin);
    return back(origin, { sorare: "connecte" });
  } catch (err) {
    console.error("[oauth] échange du code", err);
    return back(origin, { sorare: "echec" });
  }
});
