import { NextResponse } from "next/server";

/** Thrown deliberately by route handlers — message and status go straight to the client. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Turns an unexpected error into something a manager can act on.
 *
 * Passing `err.message` straight through meant a missing DATABASE_URL surfaced
 * in the app's error banner as a Prisma stack excerpt, schema line numbers and
 * all — unreadable, and it says nothing about what to do next. The underlying
 * error still goes to the server log for debugging; only the wording changes.
 */
function humanMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (/Environment variable not found: DATABASE_URL|Can't reach database server|P1001/i.test(raw)) {
    return "Base de données injoignable. Vérifie DATABASE_URL dans la configuration du projet.";
  }
  if (/prisma|P\d{4}/i.test(raw)) {
    return "Erreur de base de données — le détail est dans les logs du serveur.";
  }
  if (/Sorare HTTP 429|rate limit/i.test(raw)) {
    return "Limite de requêtes Sorare atteinte. Réessaie dans une minute.";
  }
  if (/Sorare HTTP 5\d\d/i.test(raw)) {
    return "L'API Sorare ne répond pas correctement. Réessaie dans quelques minutes.";
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(raw)) {
    return "Connexion réseau impossible. Vérifie ta connexion et réessaie.";
  }
  // A GraphQL field error is a real bug in the app, not something the user did
  // — say so rather than showing the raw selection path.
  if (/doesn't exist on type|GraphQL/i.test(raw)) {
    return "Une requête Sorare a été refusée — l'API a probablement changé. Le détail est dans les logs.";
  }

  return raw;
}

/**
 * Wraps a route handler so any thrown error (ApiError, Prisma error, network
 * error, ...) becomes a JSON response instead of Next's default HTML error
 * page — the front-end always gets `{ error: string }` back, never a page it
 * can't parse.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: humanMessage(err) }, { status: 500 });
    }
  };
}
