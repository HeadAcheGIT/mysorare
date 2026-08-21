/**
 * Posts every GraphQL document in the repo to Sorare and checks the server
 * accepts its *shape*.
 *
 * Why this exists: this project has now been bitten three times by a query
 * that compiles, type-checks and deploys fine but is rejected by the API at
 * runtime — a field moved onto a concrete type, a root field that isn't where
 * it looks like it is, a connection renamed between seasons. Each one failed
 * silently in production (enrichment stopped, card sync stopped, appearances
 * stopped) because nothing exercises these strings until a user triggers them.
 *
 * An auth error or NOT_FOUND is a PASS: the document parsed and validated,
 * which is all this can check without credentials. A missing field or a
 * complexity overflow is a FAIL.
 *
 *   npm run test:queries
 *
 * Unauthenticated calls are capped at 20/min and 500 complexity, so the run is
 * paced and a complexity failure may just mean "needs an API key" — the
 * message says which.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ENDPOINT = "https://api.sorare.com/graphql";
const ROOTS = process.argv.slice(2).length ? process.argv.slice(2) : ["lib"];

/** Sample values good enough to get past variable coercion — never used for real data. */
const VARS = {
  slug: "football-14-18-aug-2026",
  lb: "football-14-18-aug-2026-seasonal-spain-in_season_spain_limited",
  slugs: ["erling-haland"],
  last: 5,
  first: 3,
  query: "haaland",
  pageSize: 3,
  rarity: "limited",
  after: null,
  before: null,
  appearances: [],
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if ([".ts", ".mjs", ".js"].includes(extname(full))) out.push(full);
  }
  return out;
}

function extractQueries(src) {
  const out = [];
  const re = /export const ([A-Z0-9_]+)\s*=\s*`([\s\S]*?)`;/g;
  let m;
  while ((m = re.exec(src))) {
    const [, name, body] = m;
    if (!/^\s*(query|mutation)/m.test(body)) continue;
    out.push({ name, body });
  }
  return out;
}

/**
 * Per-document overrides, for variables whose *value* is part of what needs
 * validating rather than just a placeholder to get past coercion.
 *
 * Page size is the case that matters: complexity scales with it, so checking a
 * paginated document at the generic `first: 3` proves nothing about the size it
 * actually ships with. LIVE_AUCTIONS_PUBLIC passed this script at `first: 3`
 * and then failed in the app at its real 15 — 501 against a cap of 500. Any
 * document paged near the ceiling belongs here, set to what the code sends.
 */
const VARS_BY_QUERY = {
  LIVE_AUCTIONS_PUBLIC: { first: 12 },
  // Complexity scales with the length of $slugs, not with whether the slugs
  // resolve to real records, so a placeholder repeated to the right count
  // proves the same thing as real data would. Sized to the *keyless* batch
  // constants in lib/sorare/publicClient.ts (PLAYERS_PER_QUERY,
  // CARDS_PER_OWNERSHIP_QUERY) — this script always runs unauthenticated, and
  // those are the sizes that actually ship on the app's documented default
  // path.
  //
  // This is exactly the check that would have caught both real outages
  // before they shipped: the generic single-slug $slugs placeholder these
  // queries used before proved nothing about a real batch. Measured against
  // the live API, a 15-player PLAYERS_BY_SLUG batch scores 586 and a
  // 10-card CARD_OWNERSHIP_PUBLIC batch scores 721 — both rejected — and
  // neither failed here until a real sync ran in production. If a batch
  // constant changes, update the count here to match — a mismatch defeats
  // the whole point of the check.
  PLAYERS_BY_SLUG: { slugs: Array(10).fill("erling-haland") },
  CARD_OWNERSHIP_PUBLIC: { slugs: Array(5).fill("erling-haland-2024-limited-1") },
};

function varsFor(body, name) {
  const decl = body.match(/(?:query|mutation)\s+\w+\(([^)]*)\)/);
  if (!decl) return {};
  const vars = {};
  for (const part of decl[1].split(",")) {
    const varName = part.trim().match(/^\$(\w+):/)?.[1];
    if (!varName) continue;
    if (!(varName in VARS)) throw new Error(`no sample value for $${varName} — add one to VARS`);
    vars[varName] = VARS[varName];
  }
  return { ...vars, ...(VARS_BY_QUERY[name] ?? {}) };
}

/**
 * Errors that still prove the document is well-formed. "Not authorized … you
 * should log in" is the common one: the server resolved the field and only
 * then refused it, which is exactly the validation this script is after.
 */
const shapeOk = (msg) =>
  /not found|NOT_FOUND|not authoriz|unauthor|authenticat|should log in|token|signed|permission/i.test(msg);

const files = ROOTS.flatMap((r) => (statSync(r).isDirectory() ? walk(r) : [r]));
let failures = 0;
let checked = 0;

for (const file of files) {
  for (const { name, body } of extractQueries(readFileSync(file, "utf8"))) {
    checked++;
    let verdict;
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: body, variables: varsFor(body, name) }),
      });
      const err = (await r.json()).errors?.[0]?.message;
      if (!err) verdict = "ok";
      else if (shapeOk(err)) verdict = "ok (auth/not-found — shape valid)";
      else {
        verdict = err;
        failures++;
      }
    } catch (e) {
      verdict = e.message;
      failures++;
    }
    const pass = verdict.startsWith("ok");
    console.log(`${pass ? "  ok  " : "FAIL  "}${name.padEnd(26)} ${pass ? "" : verdict}`);
    await new Promise((r) => setTimeout(r, 3300)); // 20 req/min unauthenticated
  }
}

console.log(
  failures ? `\n${failures}/${checked} document(s) rejected by the API` : `\n${checked} documents, all valid`
);
process.exit(failures ? 1 : 0);
