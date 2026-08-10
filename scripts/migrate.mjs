/**
 * Applies pending Prisma migrations at build time so the database schema is
 * always in sync with the deployed code — no manual `prisma db push` step.
 *
 * Skips (instead of failing the build) when DATABASE_URL is missing, so a
 * fresh clone or a deploy made before the env var is configured still builds.
 * The app itself surfaces the missing-database error at runtime, where it's
 * actionable, rather than turning it into an opaque build failure.
 */
import { execFileSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.warn("[migrate] DATABASE_URL not set — skipping migrations.");
  process.exit(0);
}

try {
  execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", shell: true });
} catch {
  // A migration that can't apply means the deployed code would run against a
  // schema it doesn't match — fail loudly rather than ship a broken deploy.
  console.error("[migrate] prisma migrate deploy failed — see the error above.");
  process.exit(1);
}
