import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authorizeUrl, isOAuthConfigured } from "@/lib/sorare/oauth";
import { ApiError, withErrorHandling } from "@/lib/apiHandler";

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
  if (!isOAuthConfigured()) {
    throw new ApiError(
      "Sorare Connect n'est pas configuré. Crée une application sur sorare.com/settings/developer, " +
        "puis renseigne SORARE_OAUTH_CLIENT_ID et SORARE_OAUTH_CLIENT_SECRET.",
      501
    );
  }

  const state = randomBytes(16).toString("hex");
  const origin = new URL(req.url).origin;

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
