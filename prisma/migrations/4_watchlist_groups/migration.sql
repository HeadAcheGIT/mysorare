-- CreateTable
CREATE TABLE "WatchlistGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistGroup_pkey" PRIMARY KEY ("id")
);

-- Backfill: every existing watchlist item moves into one default group so the
-- app never has to special-case "no group yet".
INSERT INTO "WatchlistGroup" ("name") VALUES ('Général');

-- AlterTable
ALTER TABLE "WatchlistItem" ADD COLUMN "groupId" INTEGER;
-- The old uniqueness was a plain CREATE UNIQUE INDEX (see 0_init), not a table
-- constraint, so it has to be dropped with DROP INDEX, not DROP CONSTRAINT —
-- the latter silently no-ops against an index and leaves the old
-- one-list-only uniqueness in place, blocking the same player from being
-- added to a second list.
DROP INDEX IF EXISTS "WatchlistItem_playerSlug_key";

UPDATE "WatchlistItem" SET "groupId" = (SELECT "id" FROM "WatchlistGroup" WHERE "name" = 'Général' LIMIT 1)
WHERE "groupId" IS NULL;

ALTER TABLE "WatchlistItem" ALTER COLUMN "groupId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_playerSlug_groupId_key" ON "WatchlistItem"("playerSlug", "groupId");
CREATE INDEX "WatchlistItem_groupId_idx" ON "WatchlistItem"("groupId");

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WatchlistGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
