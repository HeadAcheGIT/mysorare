-- Folder prefix continues the letter scheme — see a_eth_rate_and_approx_flags.

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "acquiredVia" TEXT,
ADD COLUMN     "acquiredAt" TIMESTAMP(3),
ADD COLUMN     "paidWithCredits" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "boughtPriceApprox" BOOLEAN NOT NULL DEFAULT false;
