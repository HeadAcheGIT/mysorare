-- Folder is prefixed "a_", not "10_": prisma migrate deploy orders migrations
-- by lexical sort of the folder name, and "10_..." sorts right after "0_init"
-- and before "1_gallery_enrichment" (string comparison, not numeric) — it
-- would apply before the tables it alters even exist. Renaming 0_init..
-- 9_backfill_badges to zero-padded names isn't an option either: prod's
-- _prisma_migrations table already has rows keyed by their exact current
-- folder names, so renaming history would make prisma treat every one of
-- them as new and re-run from scratch. "a_" onward (a, b, c, …) sorts after
-- every digit-prefixed legacy migration and keeps sorting correctly among
-- itself — continue this letter scheme for future migrations.

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "boughtPriceApprox" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "soldPriceApprox" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EthRate" (
    "date" TIMESTAMP(3) NOT NULL,
    "eurPerEth" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EthRate_pkey" PRIMARY KEY ("date")
);
