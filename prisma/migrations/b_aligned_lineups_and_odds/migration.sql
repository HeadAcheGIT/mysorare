-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "sorareStarterOdds" DOUBLE PRECISION,
ADD COLUMN     "sorareOddsProviderName" TEXT,
ADD COLUMN     "sorareOddsProviderIconUrl" TEXT,
ADD COLUMN     "sorareOddsReliability" TEXT;

-- AlterTable
ALTER TABLE "Projection" ADD COLUMN     "sorareStarterOdds" DOUBLE PRECISION,
ADD COLUMN     "sorareOddsProviderName" TEXT;

-- CreateTable
CREATE TABLE "AlignedLineup" (
    "id" SERIAL NOT NULL,
    "so5LineupId" TEXT NOT NULL,
    "fixtureSlug" TEXT NOT NULL,
    "leaderboardSlug" TEXT,
    "leaderboardName" TEXT,
    "division" INTEGER,
    "playerSlug" TEXT NOT NULL,
    "cardSlug" TEXT NOT NULL,
    "captain" BOOLEAN NOT NULL DEFAULT false,
    "position" TEXT,
    "actualScore" DOUBLE PRECISION,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlignedLineup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlignedLineup_so5LineupId_cardSlug_key" ON "AlignedLineup"("so5LineupId", "cardSlug");

-- CreateIndex
CREATE INDEX "AlignedLineup_fixtureSlug_idx" ON "AlignedLineup"("fixtureSlug");

-- CreateIndex
CREATE INDEX "AlignedLineup_playerSlug_idx" ON "AlignedLineup"("playerSlug");
