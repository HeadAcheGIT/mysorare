import { next } from "@vercel/functions/middleware";

const REALM = "Sorare Cockpit";

/**
 * Vercel's own SSO protection was dropped in favor of this so the app works
 * without a Vercel login (mobile PWA, single user). Everything — pages and
 * API routes alike — is gated: several API routes mutate data and have no
 * auth of their own (see lib/apiHandler.ts), so this middleware is the only
 * thing standing between the public internet and them. Fails closed if
 * APP_PASSWORD isn't set, rather than silently leaving the app open.
 *
 * Deliberately avoids `next/server` (NextRequest/NextResponse): importing it
 * here crashes in production with "ReferenceError: __dirname is not
 * defined" — a Next.js 14 Edge-runtime bundling bug that pulls in its
 * internal ua-parser-js copy regardless of what's actually used. Works fine
 * in `next dev` (Node polyfills __dirname there), only breaks on Vercel's
 * real Edge runtime. `@vercel/functions` provides the same "continue to the
 * route" behavior without the bad import.
 */
export default function middleware(req: Request) {
  // Vercel Cron authenticates with `Bearer <CRON_SECRET>`, which this Basic
  // Auth gate would reject — the route checks that secret itself, so let it
  // through rather than silently breaking the daily sync.
  if (new URL(req.url).pathname === "/api/cron") return next();

  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return new Response(
      "APP_PASSWORD n'est pas configuré — ajoute-le dans les variables d'environnement Vercel, puis redéploie.",
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = atob(auth.slice("Basic ".length));
    const password = decoded.slice(decoded.indexOf(":") + 1);
    if (password === expected) return next();
  }

  return new Response("Authentification requise", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}"` },
  });
}

export const config = {
  // Skip the PWA install assets — the browser fetches manifest/service
  // worker/icons without credentials before the user has a chance to log in.
  matcher: ["/((?!manifest.json|sw.js|icons/|favicon.ico|_next/static|_next/image).*)"],
};
