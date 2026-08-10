export class ApiFetchError extends Error {}

/**
 * fetch() wrapper for client components: every API route now returns
 * `{ error: string }` JSON on failure (see lib/apiHandler.ts), but a
 * mis-configured deploy or a crash before reaching the handler can still
 * return Next's HTML error page — .json() on that would throw an opaque
 * SyntaxError, so we guard the parse and fall back to the HTTP status.
 */
export async function apiFetch<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  const r = await fetch(input, init);
  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    // non-JSON response, handled below
  }
  if (!r.ok) {
    const b = body as { error?: unknown; detail?: unknown } | null;
    const message = b?.error ?? b?.detail;
    throw new ApiFetchError(typeof message === "string" && message ? message : `Erreur ${r.status}`);
  }
  return body as T;
}
