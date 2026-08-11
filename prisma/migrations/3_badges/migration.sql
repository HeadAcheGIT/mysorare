-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "birthDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "competitionSlug" TEXT,
ADD COLUMN     "competitionName" TEXT;
