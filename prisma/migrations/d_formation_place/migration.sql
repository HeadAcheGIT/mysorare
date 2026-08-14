-- Folder prefix continues the letter scheme — see a_eth_rate_and_approx_flags.

-- AlterTable
ALTER TABLE "Appearance" ADD COLUMN     "formationPlace" INTEGER;

-- AlterTable
ALTER TABLE "Projection" ADD COLUMN     "pPlay" DOUBLE PRECISION,
ADD COLUMN     "pStartBasis" TEXT NOT NULL DEFAULT 'appearances';
