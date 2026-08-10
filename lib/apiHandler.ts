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
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Erreur interne" },
        { status: 500 }
      );
    }
  };
}
