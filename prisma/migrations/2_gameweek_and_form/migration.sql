-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "app15" INTEGER,
ADD COLUMN     "app5" INTEGER,
ADD COLUMN     "avgL10Played" DOUBLE PRECISION,
ADD COLUMN     "avgL15" DOUBLE PRECISION,
ADD COLUMN     "avgL5" DOUBLE PRECISION,
ADD COLUMN     "seasonAppearances" INTEGER;

-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "cutOffDate" TIMESTAMP(3),
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "gameWeek" INTEGER;

