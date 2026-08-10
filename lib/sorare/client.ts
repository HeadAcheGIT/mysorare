import { config } from "../config";
import { getToken } from "./auth";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Serverless functions don't share memory between invocations, so there's no
 * point in a token-bucket that persists across requests — each sync run is
 * one function execution end to end. Instead, this just paces calls with a
 * fixed delay: 60/min authenticated → ~1.1s between calls, 600/min with an
 * API key → ~120ms. That alone keeps a squad-sized sync under Vercel's
 * function timeout on the free plan (10s for Hobby, so keep squads modest —
 * see README) without hitting Sorare's rate limit.
 */
const MIN_DELAY_MS = config.sorareApiKey ? 120 : 1100;

let lastCall = 0;
let cachedToken: string | null = null;

async function pace() {
  const wait = MIN_DELAY_MS - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}

export async function graphql<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
  attempt = 0
): Promise<T> {
  await pace();
  if (!cachedToken) cachedToken = await getToken();

  const headers: Record<string, string> = {
    "content-type": "application/json",
    Authorization: `Bearer ${cachedToken}`,
    "JWT-AUD": config.sorareAud,
  };
  if (config.sorareApiKey) headers.APIKEY = config.sorareApiKey;

  const r = await fetch(config.graphqlUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (r.status === 429 && attempt < 4) {
    const retryAfter = Number(r.headers.get("retry-after") ?? "5");
    await sleep(retryAfter * 1000);
    return graphql<T>(query, variables, attempt + 1);
  }
  if (r.status === 401 && attempt < 1) {
    cachedToken = await getToken(true);
    return graphql<T>(query, variables, attempt + 1);
  }
  if (r.status === 413) {
    throw new Error("Query payload too large — request fewer fields or paginate smaller.");
  }
  if (!r.ok) throw new Error(`Sorare HTTP ${r.status}`);

  const body = await r.json();
  if (body.errors?.length) {
    throw new Error(`GraphQL error: ${body.errors.map((e: { message: string }) => e.message).join("; ")}`);
  }
  return body.data as T;
}

/** Walks a Relay connection: { nodes: [...], pageInfo: { hasNextPage, endCursor } }. */
export async function* paginate<T = unknown>(
  query: string,
  variables: Record<string, unknown>,
  path: string[],
  pageSize = 50
): AsyncGenerator<T> {
  let cursor: string | null = null;
  for (;;) {
    const data: any = await graphql<any>(query, { ...variables, after: cursor, first: pageSize });
    let conn: any = data;
    for (const key of path) conn = conn[key];
    for (const node of conn.nodes ?? []) yield node as T;
    if (!conn.pageInfo?.hasNextPage) return;
    cursor = conn.pageInfo.endCursor;
  }
}
