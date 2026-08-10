import { NextRequest, NextResponse } from "next/server";

const REALM = "Sorare Cockpit";

/**
 * Vercel's own SSO protection was dropped in favor of this so the app works
 * without a Vercel login (mobile PWA, single user). Everything — pages and
 * API routes alike — is gated: several API routes mutate data and have no
 * auth of their own (see lib/apiHandler.ts), so this middleware is the only
 * thing standing between the public internet and them. Fails closed if
 * APP_PASSWORD isn't set, rather than silently leaving the app open.
 */
export function middleware(req: NextRequest) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return new NextResponse(
      "APP_PASSWORD n'est pas configuré — ajoute-le dans les variables d'environnement Vercel, puis redéploie.",
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = atob(auth.slice("Basic ".length));
    const password = decoded.slice(decoded.indexOf(":") + 1);
    if (password === expected) return NextResponse.next();
  }

  return new NextResponse("Authentification requise", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}"` },
  });
}

export const config = {
  // Skip the PWA install assets — the browser fetches manifest/service
  // worker/icons without credentials before the user has a chance to log in.
  matcher: ["/((?!manifest.json|sw.js|icons/|favicon.ico|_next/static|_next/image).*)"],
};
