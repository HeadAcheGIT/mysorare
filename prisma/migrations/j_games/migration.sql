-- Folder prefix continues the letter scheme — see a_eth_rate_and_approx_flags.

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "fixtureSlug" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "homeClubSlug" TEXT NOT NULL,
    "awayClubSlug" TEXT NOT NULL,
    "homeRanking" INTEGER,
    "awayRanking" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Game_fixtureSlug_idx" ON "Game"("fixtureSlug");

-- CreateIndex
CREATE INDEX "Game_fixtureSlug_homeClubSlug_idx" ON "Game"("fixtureSlug", "homeClubSlug");

-- CreateIndex
CREATE INDEX "Game_fixtureSlug_awayClubSlug_idx" ON "Game"("fixtureSlug", "awayClubSlug");
