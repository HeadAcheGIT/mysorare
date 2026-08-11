import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Separate config for tests that hit a real Postgres (via Prisma) rather
 * than pure functions. Kept apart from vitest.config.ts so `npm test` stays
 * fast and dependency-free — these only run when DATABASE_URL points at a
 * disposable database (see README notes / CI setup).
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    // Tests share one database and mutate global tables — run them one at a
    // time so they can't race each other.
    fileParallelism: false,
    testTimeout: 20_000,
    setupFiles: ["./vitest.integration.setup.ts"],
  },
});
