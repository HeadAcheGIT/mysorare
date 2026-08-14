-- Folder prefix continues the letter scheme started by "a_" — see
-- a_eth_rate_and_approx_flags/migration.sql for why digits can't be used.

-- CreateTable
CREATE TABLE "LeagueTrack" (
    "slug" TEXT NOT NULL,
    "fixtureSlug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "seasonality" TEXT,
    "seasonalityName" TEXT,
    "canCompose" BOOLEAN NOT NULL DEFAULT false,
    "canComposeReason" TEXT,
    "maxManagerTeams" INTEGER NOT NULL DEFAULT 0,
    "unlockedManagerTeams" INTEGER NOT NULL DEFAULT 0,
    "lineupsCount" INTEGER NOT NULL DEFAULT 0,
    "prizePool" DOUBLE PRECISION,
    "prizePoolCurrency" TEXT,
    "iconUrl" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueTrack_pkey" PRIMARY KEY ("fixtureSlug","slug")
);

-- CreateTable
CREATE TABLE "Division" (
    "slug" TEXT NOT NULL,
    "fixtureSlug" TEXT NOT NULL,
    "trackSlug" TEXT,
    "displayName" TEXT NOT NULL,
    "division" INTEGER,
    "rarityType" TEXT,
    "seasonality" TEXT,
    "cutOffDate" TIMESTAMP(3),
    "canCompose" BOOLEAN NOT NULL DEFAULT false,
    "canComposeReason" TEXT,
    "missingCards" INTEGER NOT NULL DEFAULT 0,
    "missingPositions" TEXT,
    "missingRarities" TEXT,
    "notEnoughEligibleCards" BOOLEAN NOT NULL DEFAULT false,
    "transferMarketFilters" TEXT,
    "prizePool" DOUBLE PRECISION,
    "prizePoolCurrency" TEXT,
    "divisionIconUrl" TEXT,
    "myLineupCount" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Division_pkey" PRIMARY KEY ("fixtureSlug","slug")
);

-- CreateIndex
CREATE INDEX "Division_fixtureSlug_idx" ON "Division"("fixtureSlug");

-- CreateTable
CREATE TABLE "DivisionEligibility" (
    "id" SERIAL NOT NULL,
    "fixtureSlug" TEXT NOT NULL,
    "divisionSlug" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "seasonality" TEXT,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "usedCardsCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DivisionEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Name truncated to Postgres' 63-char identifier limit, matching exactly what
-- `prisma migrate diff` generates — a mismatch here reads as schema drift.
CREATE UNIQUE INDEX "DivisionEligibility_fixtureSlug_divisionSlug_position_seaso_key"
    ON "DivisionEligibility"("fixtureSlug", "divisionSlug", "position", "seasonality");

-- CreateIndex
CREATE INDEX "DivisionEligibility_fixtureSlug_divisionSlug_idx"
    ON "DivisionEligibility"("fixtureSlug", "divisionSlug");

-- CreateTable
CREATE TABLE "ManagerTeam" (
    "id" TEXT NOT NULL,
    "fixtureSlug" TEXT NOT NULL,
    "trackSlug" TEXT,
    "name" TEXT NOT NULL,
    "activeDivision" INTEGER,
    "divisionIconUrl" TEXT,
    "rarityType" TEXT,
    "seasonality" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManagerTeam_fixtureSlug_idx" ON "ManagerTeam"("fixtureSlug");

-- AddForeignKey
ALTER TABLE "Division" ADD CONSTRAINT "Division_fixtureSlug_trackSlug_fkey"
    FOREIGN KEY ("fixtureSlug", "trackSlug") REFERENCES "LeagueTrack"("fixtureSlug", "slug")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DivisionEligibility" ADD CONSTRAINT "DivisionEligibility_fixtureSlug_divisionSlug_fkey"
    FOREIGN KEY ("fixtureSlug", "divisionSlug") REFERENCES "Division"("fixtureSlug", "slug")
    ON DELETE CASCADE ON UPDATE CASCADE;
