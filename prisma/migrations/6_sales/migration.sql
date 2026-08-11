-- CreateTable
CREATE TABLE "Sale" (
    "id" SERIAL NOT NULL,
    "cardSlug" TEXT NOT NULL,
    "playerSlug" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "season" INTEGER,
    "serialNumber" INTEGER,
    "boughtPrice" DOUBLE PRECISION,
    "lastKnownPrice" DOUBLE PRECISION,
    "lastFloorPrice" DOUBLE PRECISION,
    "lastEstimatedPrice" DOUBLE PRECISION,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_cardSlug_key" ON "Sale"("cardSlug");
CREATE INDEX "Sale_playerSlug_idx" ON "Sale"("playerSlug");
