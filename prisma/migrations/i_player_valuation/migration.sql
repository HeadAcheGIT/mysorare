-- Folder prefix continues the letter scheme — see a_eth_rate_and_approx_flags.

-- CreateTable
CREATE TABLE "PlayerValuation" (
    "playerSlug" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "inSeason" BOOLEAN NOT NULL,
    "value" DOUBLE PRECISION,
    "low" DOUBLE PRECISION,
    "high" DOUBLE PRECISION,
    "sampleSize" INTEGER NOT NULL,
    "totalSales" INTEGER NOT NULL,
    "windowDays" INTEGER,
    "daysSinceLast" INTEGER,
    "trendPct" DOUBLE PRECISION,
    "launchPremium" BOOLEAN NOT NULL DEFAULT false,
    "thin" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerValuation_pkey" PRIMARY KEY ("playerSlug","rarity","inSeason")
);

-- CreateIndex
CREATE INDEX "PlayerValuation_computedAt_idx" ON "PlayerValuation"("computedAt");
