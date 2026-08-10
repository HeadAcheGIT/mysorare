-- Adds the fields backing the CSV gallery import and the public-API
-- enrichment. Purely additive: every new column is nullable or has a default,
-- so this applies to a populated database without rewriting existing rows.
-- Existing cards predate the importer, hence the 'api' default on source.

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "pictureUrl" TEXT;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "country" TEXT,
ADD COLUMN     "enrichedAt" TIMESTAMP(3),
ADD COLUMN     "pictureUrl" TEXT,
ADD COLUMN     "recentScores" TEXT,
ADD COLUMN     "shirtNumber" INTEGER,
ADD COLUMN     "sorareProjection" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "boughtPrice" DOUBLE PRECISION,
ADD COLUMN     "estimatedPrice" DOUBLE PRECISION,
ADD COLUMN     "floorPrice" DOUBLE PRECISION,
ADD COLUMN     "l10" DOUBLE PRECISION,
ADD COLUMN     "price" DOUBLE PRECISION,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'api';
