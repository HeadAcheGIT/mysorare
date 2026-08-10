-- CreateTable
CREATE TABLE "Club" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "Player" (
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "age" INTEGER,
    "clubSlug" TEXT,
    "injuryStatus" TEXT,
    "injuryUntil" TIMESTAMP(3),
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "Card" (
    "slug" TEXT NOT NULL,
    "assetId" TEXT,
    "playerSlug" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "season" INTEGER,
    "inSeason" BOOLEAN NOT NULL DEFAULT false,
    "serialNumber" INTEGER,
    "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "Fixture" (
    "slug" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "state" TEXT,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "Appearance" (
    "id" SERIAL NOT NULL,
    "playerSlug" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gameDate" TIMESTAMP(3),
    "competition" TEXT,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "started" BOOLEAN NOT NULL DEFAULT false,
    "onGameSheet" BOOLEAN NOT NULL DEFAULT false,
    "score" DOUBLE PRECISION,

    CONSTRAINT "Appearance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Projection" (
    "id" SERIAL NOT NULL,
    "playerSlug" TEXT NOT NULL,
    "fixtureSlug" TEXT NOT NULL,
    "pStart" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "floorScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "l5" DOUBLE PRECISION,
    "l15" DOUBLE PRECISION,
    "gamesInWeek" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Projection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectionSource" (
    "id" SERIAL NOT NULL,
    "playerSlug" TEXT NOT NULL,
    "fixtureSlug" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "pStart" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "detail" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectionSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Override" (
    "id" SERIAL NOT NULL,
    "playerSlug" TEXT NOT NULL,
    "fixtureSlug" TEXT NOT NULL,
    "pStart" DOUBLE PRECISION,
    "expectedScore" DOUBLE PRECISION,
    "exclude" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Override_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedLineup" (
    "id" SERIAL NOT NULL,
    "fixtureSlug" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "cardSlugs" TEXT NOT NULL,
    "captainSlug" TEXT,
    "projectedTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedLineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" SERIAL NOT NULL,
    "job" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenCache" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" SERIAL NOT NULL,
    "playerSlug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" TEXT,
    "club" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalTeamMapping" (
    "clubSlug" TEXT NOT NULL,
    "apiFootballTeamId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalTeamMapping_pkey" PRIMARY KEY ("clubSlug")
);

-- CreateTable
CREATE TABLE "ExternalPlayerMapping" (
    "playerSlug" TEXT NOT NULL,
    "apiFootballPlayerId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalPlayerMapping_pkey" PRIMARY KEY ("playerSlug")
);

-- CreateIndex
CREATE INDEX "Card_playerSlug_idx" ON "Card"("playerSlug");

-- CreateIndex
CREATE INDEX "Appearance_playerSlug_idx" ON "Appearance"("playerSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Appearance_playerSlug_gameId_key" ON "Appearance"("playerSlug", "gameId");

-- CreateIndex
CREATE INDEX "Projection_fixtureSlug_idx" ON "Projection"("fixtureSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Projection_playerSlug_fixtureSlug_key" ON "Projection"("playerSlug", "fixtureSlug");

-- CreateIndex
CREATE INDEX "ProjectionSource_fixtureSlug_idx" ON "ProjectionSource"("fixtureSlug");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectionSource_playerSlug_fixtureSlug_source_key" ON "ProjectionSource"("playerSlug", "fixtureSlug", "source");

-- CreateIndex
CREATE UNIQUE INDEX "Override_playerSlug_fixtureSlug_key" ON "Override"("playerSlug", "fixtureSlug");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_playerSlug_key" ON "WatchlistItem"("playerSlug");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_clubSlug_fkey" FOREIGN KEY ("clubSlug") REFERENCES "Club"("slug") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_playerSlug_fkey" FOREIGN KEY ("playerSlug") REFERENCES "Player"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appearance" ADD CONSTRAINT "Appearance_playerSlug_fkey" FOREIGN KEY ("playerSlug") REFERENCES "Player"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projection" ADD CONSTRAINT "Projection_playerSlug_fkey" FOREIGN KEY ("playerSlug") REFERENCES "Player"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectionSource" ADD CONSTRAINT "ProjectionSource_playerSlug_fkey" FOREIGN KEY ("playerSlug") REFERENCES "Player"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Override" ADD CONSTRAINT "Override_playerSlug_fkey" FOREIGN KEY ("playerSlug") REFERENCES "Player"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

