-- Folder prefix continues the letter scheme — see a_eth_rate_and_approx_flags.

-- CreateTable
CREATE TABLE "SeasonReward" (
    "id" TEXT NOT NULL,
    "fixtureSlug" TEXT NOT NULL,
    "gameWeek" INTEGER,
    "leaderboardSlug" TEXT NOT NULL,
    "leaderboardName" TEXT,
    "division" INTEGER,
    "ranking" INTEGER,
    "score" DOUBLE PRECISION,
    "rewardEur" DOUBLE PRECISION,
    "rewardCards" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeasonReward_fixtureSlug_idx" ON "SeasonReward"("fixtureSlug");
