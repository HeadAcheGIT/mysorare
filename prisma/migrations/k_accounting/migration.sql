-- Folder prefix continues the letter scheme — see a_eth_rate_and_approx_flags.

-- CreateTable
CREATE TABLE "AccountingEntry" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "entryType" TEXT NOT NULL,
    "operationType" TEXT,
    "cardSlug" TEXT,
    "description" TEXT,
    "currency" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "eurAmount" DOUBLE PRECISION,
    "isWallet" BOOLEAN NOT NULL,
    "direction" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountingEntry_cardSlug_idx" ON "AccountingEntry"("cardSlug");

-- CreateIndex
CREATE INDEX "AccountingEntry_date_idx" ON "AccountingEntry"("date");
