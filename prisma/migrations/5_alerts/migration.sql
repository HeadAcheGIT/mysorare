-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" SERIAL NOT NULL,
    "playerSlug" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "floorPrice" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceSnapshot_playerSlug_rarity_capturedAt_idx" ON "PriceSnapshot"("playerSlug", "rarity", "capturedAt");

-- CreateTable
CREATE TABLE "PlayerAlert" (
    "id" SERIAL NOT NULL,
    "playerSlug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerAlert_playerSlug_kind_key" ON "PlayerAlert"("playerSlug", "kind");
