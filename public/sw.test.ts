import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The service worker is a plain /public file, not part of the TS build, so
 * it can't be imported. These tests read the source and assert the two
 * properties that actually caused a production outage when they were wrong:
 *
 *  1. HTML documents must never be served cache-first. The old worker cached
 *     "/" at install and served it forever, so every deploy left installed
 *     PWAs asking for chunk URLs that no longer existed — 404s, failed
 *     hydration, a permanently broken home-screen app.
 *  2. The cache name must be versioned, because `activate` only deletes
 *     caches whose key differs from the current one. With a fixed name there
 *     was nothing to delete and a poisoned cache could never heal itself.
 *
 * Asserting on source text is blunt, but it's the only layer available here
 * and it pins the exact regressions that hurt.
 */
const swSource = fs.readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");

describe("service worker caching strategy", () => {
  it("versions the cache name so activate can evict the previous one", () => {
    expect(swSource).toMatch(/const VERSION\s*=\s*["'`]v\d+["'`]/);
    expect(swSource).toMatch(/cockpit-shell-\$\{VERSION\}/);
  });

  it("deletes every cache that isn't the current one on activate", () => {
    expect(swSource).toMatch(/keys\.filter\(\(k\)\s*=>\s*k\s*!==\s*SHELL_CACHE\)/);
  });

  it("defines both a network-first and a cache-first strategy", () => {
    expect(swSource).toMatch(/async function networkFirst\(/);
    expect(swSource).toMatch(/async function cacheFirst\(/);
  });

  it("network-first tries fetch before falling back to the cache", () => {
    const body = swSource.slice(swSource.indexOf("async function networkFirst("));
    const fetchAt = body.indexOf("await fetch(request)");
    const cacheAt = body.indexOf("await caches.match(request)");
    expect(fetchAt).toBeGreaterThan(-1);
    expect(cacheAt).toBeGreaterThan(-1);
    // The fallback must come after the network attempt, not before it.
    expect(fetchAt).toBeLessThan(cacheAt);
  });

  it("routes only content-hashed assets to cache-first", () => {
    expect(swSource).toMatch(/function isImmutableAsset\(url\)/);
    const fn = swSource.slice(
      swSource.indexOf("function isImmutableAsset(url)"),
      swSource.indexOf("async function networkFirst(")
    );
    expect(fn).toContain("/_next/static/");
    // A bare "/" or an HTML path must never qualify as immutable.
    expect(fn).not.toMatch(/pathname\s*===\s*["'`]\/["'`]/);
  });

  it("sends everything that isn't an immutable asset through network-first", () => {
    expect(swSource).toMatch(
      /respondWith\(\s*isImmutableAsset\(url\)\s*\?\s*cacheFirst\(request\)\s*:\s*networkFirst\(request\)\s*\)/
    );
  });

  it("never intercepts API calls or non-GET requests", () => {
    expect(swSource).toMatch(/request\.method\s*!==\s*["'`]GET["'`]/);
    expect(swSource).toMatch(/pathname\.startsWith\(["'`]\/api\/["'`]\)/);
  });

  it("only caches successful same-origin responses", () => {
    // Caching an error or opaque response would poison the offline fallback.
    const matches = swSource.match(/fresh\.ok\s*&&\s*fresh\.type\s*===\s*["'`]basic["'`]/g);
    expect(matches?.length).toBe(2); // one in each strategy
  });
});
