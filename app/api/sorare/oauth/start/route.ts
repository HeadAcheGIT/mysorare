import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authorizeUrl, isOAuthConfigured } from "@/lib/sorare/oauth";
import { withErrorHandling } from "@/lib/apiHandler";

export const dynamic = "force-dynamic";

/** How long the CSRF state cookie is good for — a sign-in the user abandons shouldn't linger. */
const STATE_TTL_SECONDS = 600;

/**
 * Starts "Login with Sorare": mints a state value, stores it in a cookie, and
 * redirects to Sorare's consent screen.
 *
 * The state is what makes the callback safe — without it, anyone could feed
 * this app an authorization code of their choosing and bind our session to
 * their Sorare account.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const origin = new URL(req.url).origin;

  // The browser navigates here, so this route has to behave like a page:
  // answering with JSON left the user staring at a raw error object in a tab
  // with no way back. Every outcome returns to the app, which shows the
  // message in context.
  if (!isOAuthConfigured()) {
    return NextResponse.redirect(new URL("/?sorare=non_configure", origin));
  }

  const state = randomBytes(16).toString("hex");

  const res = NextResponse.redirect(authorizeUrl(origin, state));
  res.cookies.set("sorare_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax", // must survive the redirect back from sorare.com
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });
  return res;
});
