-- Folder prefix continues the letter scheme — see a_eth_rate_and_approx_flags.

-- AlterTable
ALTER TABLE "PlayerAlert" ADD COLUMN "stage" TEXT;
ALTER TABLE "PlayerAlert" ADD COLUMN "sourceCount" INTEGER;
ALTER TABLE "PlayerAlert" ADD COLUMN "sourceNames" TEXT;
ALTER TABLE "PlayerAlert" ADD COLUMN "headlineUrl" TEXT;
ALTER TABLE "PlayerAlert" ADD COLUMN "headlineTitle" TEXT;
ALTER TABLE "PlayerAlert" ADD COLUMN "headlineDate" TIMESTAMP(3);
