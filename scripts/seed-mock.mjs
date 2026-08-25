import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Début de l'injection des données fictives de développement...");

  // 1. Clubs
  const clubsData = [
    { slug: "paris-saint-germain", name: "Paris Saint-Germain", country: "FRA", competitionSlug: "ligue-1", competitionName: "Ligue 1", leagueRanking: 1 },
    { slug: "arsenal", name: "Arsenal", country: "ENG", competitionSlug: "premier-league", competitionName: "Premier League", leagueRanking: 2 },
    { slug: "real-madrid", name: "Real Madrid", country: "ESP", competitionSlug: "la-liga", competitionName: "La Liga", leagueRanking: 1 },
    { slug: "inter-milan", name: "Inter", country: "ITA", competitionSlug: "serie-a", competitionName: "Serie A", leagueRanking: 3 },
  ];

  for (const c of clubsData) {
    await prisma.club.upsert({
      where: { slug: c.slug },
      create: c,
      update: c,
    });
  }

  // 2. Fixture (Gameweek actuel)
  const fixtureSlug = "gw-48-2026";
  const now = new Date();
  const cutOff = new Date(now.getTime() + 48 * 3600 * 1000);

  await prisma.fixture.upsert({
    where: { slug: fixtureSlug },
    create: {
      slug: fixtureSlug,
      displayName: "Game Week 48",
      gameWeek: 48,
      cutOffDate: cutOff,
      startDate: new Date(now.getTime() + 48 * 3600 * 1000),
      endDate: new Date(now.getTime() + 96 * 3600 * 1000),
      state: "OPEN",
    },
    update: {
      displayName: "Game Week 48",
      gameWeek: 48,
      cutOffDate: cutOff,
    },
  });

  // 3. Joueurs mockés
  const birth22 = new Date(now.getFullYear() - 22, now.getMonth() - 11, now.getDate() + 20); // U23 expiring in ~20 days
  const birth27 = new Date(now.getFullYear() - 27, 4, 12);

  const playersData = [
    {
      slug: "gianluigi-donnarumma",
      displayName: "Gianluigi Donnarumma",
      position: "Goalkeeper",
      age: 27,
      clubSlug: "paris-saint-germain",
      birthDate: birth27,
      app5: 5,
      app15: 14,
      avgL5: 58.2,
      avgL15: 54.0,
      avgL10Played: 56.5,
      sorareProjection: 55.0,
      sorareStarterOdds: 0.95,
      recentScores: JSON.stringify([62, 54, 58, 48, 60]),
      enrichedAt: now,
    },
    {
      slug: "alessandro-bastoni",
      displayName: "Alessandro Bastoni",
      position: "Defender",
      age: 27,
      clubSlug: "inter-milan",
      birthDate: birth27,
      app5: 5,
      app15: 15,
      avgL5: 64.0,
      avgL15: 59.2,
      avgL10Played: 60.1,
      sorareProjection: 58.4,
      sorareStarterOdds: 0.92,
      recentScores: JSON.stringify([70, 65, 58, 55, 62, 58, 50]),
      enrichedAt: now,
    },
    {
      slug: "bukayo-saka",
      displayName: "Bukayo Saka",
      position: "Forward",
      age: 24,
      clubSlug: "arsenal",
      birthDate: new Date(now.getFullYear() - 24, 8, 5),
      app5: 5,
      app15: 13,
      avgL5: 72.4,
      avgL15: 65.8,
      avgL10Played: 68.0,
      sorareProjection: 66.5,
      sorareStarterOdds: 0.98,
      recentScores: JSON.stringify([85, 74, 68, 52, 60, 58, 54]),
      enrichedAt: now,
    },
    {
      slug: "warren-zaire-emery",
      displayName: "Warren Zaïre-Emery",
      position: "Midfielder",
      age: 22,
      clubSlug: "paris-saint-germain",
      birthDate: birth22, // Bascule U23 imminente !
      app5: 4,
      app15: 12,
      avgL5: 54.2,
      avgL15: 52.0,
      avgL10Played: 53.1,
      sorareProjection: 51.0,
      sorareStarterOdds: 0.85,
      recentScores: JSON.stringify([58, 52, 64, 45, 48]),
      enrichedAt: now,
    },
    {
      slug: "achraf-hakimi",
      displayName: "Achraf Hakimi",
      position: "Defender",
      age: 27,
      clubSlug: "paris-saint-germain",
      birthDate: birth27,
      injuryStatus: "Cuisse (retour estimé dans 2 semaines)",
      app5: 3,
      app15: 11,
      avgL5: 48.0,
      avgL15: 55.0,
      avgL10Played: 58.0,
      sorareProjection: 0,
      sorareStarterOdds: 0,
      recentScores: JSON.stringify([0, 0, 52, 64, 58]),
      enrichedAt: now,
    },
  ];

  for (const p of playersData) {
    await prisma.player.upsert({
      where: { slug: p.slug },
      create: p,
      update: p,
    });
  }

  // 4. Cartes
  const cardsData = [
    { slug: "gianluigi-donnarumma-2025-limited-14", playerSlug: "gianluigi-donnarumma", rarity: "limited", season: 2025, inSeason: true, serialNumber: 14, boughtPrice: 18.5, floorPrice: 22.0, price: 21.5, l10: 56.5 },
    { slug: "alessandro-bastoni-2024-limited-88", playerSlug: "alessandro-bastoni", rarity: "limited", season: 2024, inSeason: false, serialNumber: 88, boughtPrice: 12.0, floorPrice: 16.5, price: 15.8, l10: 60.1 },
    { slug: "bukayo-saka-2025-limited-3", playerSlug: "bukayo-saka", rarity: "limited", season: 2025, inSeason: true, serialNumber: 3, boughtPrice: 42.0, floorPrice: 58.0, price: 55.0, l10: 68.0 },
    { slug: "warren-zaire-emery-2024-limited-105", playerSlug: "warren-zaire-emery", rarity: "limited", season: 2024, inSeason: false, serialNumber: 105, boughtPrice: 9.5, floorPrice: 8.2, price: 8.5, l10: 53.1 },
    { slug: "achraf-hakimi-2024-limited-50", playerSlug: "achraf-hakimi", rarity: "limited", season: 2024, inSeason: false, serialNumber: 50, boughtPrice: 15.0, floorPrice: 11.5, price: 12.0, l10: 58.0 },
  ];

  for (const c of cardsData) {
    await prisma.card.upsert({
      where: { slug: c.slug },
      create: c,
      update: c,
    });
  }

  // 5. Valorisations
  const valData = [
    { playerSlug: "gianluigi-donnarumma", rarity: "limited", inSeason: true, value: 22.5, low: 20.0, high: 25.0, sampleSize: 8, totalSales: 12, windowDays: 14, trendPct: 12.5 },
    { playerSlug: "alessandro-bastoni", rarity: "limited", inSeason: false, value: 16.8, low: 14.5, high: 18.0, sampleSize: 10, totalSales: 15, windowDays: 21, trendPct: 8.2 },
    { playerSlug: "bukayo-saka", rarity: "limited", inSeason: true, value: 57.5, low: 52.0, high: 62.0, sampleSize: 14, totalSales: 20, windowDays: 14, trendPct: 15.4 },
    { playerSlug: "warren-zaire-emery", rarity: "limited", inSeason: false, value: 8.4, low: 7.5, high: 9.2, sampleSize: 6, totalSales: 9, windowDays: 28, trendPct: -5.1 },
    { playerSlug: "achraf-hakimi", rarity: "limited", inSeason: false, value: 11.8, low: 10.0, high: 13.5, sampleSize: 5, totalSales: 8, windowDays: 30, trendPct: -14.0 },
  ];

  for (const v of valData) {
    await prisma.playerValuation.upsert({
      where: { playerSlug_rarity_inSeason: { playerSlug: v.playerSlug, rarity: v.rarity, inSeason: v.inSeason } },
      create: v,
      update: v,
    });
  }

  // 6. Projections pour le fixture actuel
  const projData = [
    { playerSlug: "gianluigi-donnarumma", fixtureSlug, pStart: 0.95, pPlay: 0.95, pStartBasis: "starts", expectedScore: 56.2, floorScore: 40.0, l5: 58.2, l15: 54.0, confidence: 0.9 },
    { playerSlug: "alessandro-bastoni", fixtureSlug, pStart: 0.92, pPlay: 0.95, pStartBasis: "starts", expectedScore: 59.5, floorScore: 45.0, l5: 64.0, l15: 59.2, confidence: 0.88 },
    { playerSlug: "bukayo-saka", fixtureSlug, pStart: 0.98, pPlay: 0.99, pStartBasis: "starts", expectedScore: 68.4, floorScore: 48.0, l5: 72.4, l15: 65.8, confidence: 0.95 },
    { playerSlug: "warren-zaire-emery", fixtureSlug, pStart: 0.85, pPlay: 0.92, pStartBasis: "starts", expectedScore: 52.0, floorScore: 38.0, l5: 54.2, l15: 52.0, confidence: 0.8 },
    { playerSlug: "achraf-hakimi", fixtureSlug, pStart: 0.0, pPlay: 0.0, pStartBasis: "starts", expectedScore: 0.0, floorScore: 0.0, l5: 48.0, l15: 55.0, confidence: 1.0, note: "Blessé (cuisse)" },
  ];

  for (const p of projData) {
    await prisma.projection.upsert({
      where: { playerSlug_fixtureSlug: { playerSlug: p.playerSlug, fixtureSlug: p.fixtureSlug } },
      create: p,
      update: p,
    });
  }

  // 7. Snapshots de prix pour tester le graphique d'historique
  const baseSnapshots = [
    { playerSlug: "bukayo-saka", rarity: "limited", daysAgo: 30, price: 44.0 },
    { playerSlug: "bukayo-saka", rarity: "limited", daysAgo: 20, price: 48.5 },
    { playerSlug: "bukayo-saka", rarity: "limited", daysAgo: 10, price: 52.0 },
    { playerSlug: "bukayo-saka", rarity: "limited", daysAgo: 1, price: 58.0 },
    { playerSlug: "gianluigi-donnarumma", rarity: "limited", daysAgo: 25, price: 18.0 },
    { playerSlug: "gianluigi-donnarumma", rarity: "limited", daysAgo: 12, price: 20.5 },
    { playerSlug: "gianluigi-donnarumma", rarity: "limited", daysAgo: 2, price: 22.0 },
  ];

  for (const s of baseSnapshots) {
    const snapDate = new Date(now.getTime() - s.daysAgo * 24 * 3600 * 1000);
    await prisma.priceSnapshot.create({
      data: {
        playerSlug: s.playerSlug,
        rarity: s.rarity,
        floorPrice: s.price,
        capturedAt: snapDate,
      },
    });
  }

  // 8. Vente mockée
  await prisma.sale.upsert({
    where: { cardSlug: "bradley-barcola-2024-limited-99" },
    create: {
      cardSlug: "bradley-barcola-2024-limited-99",
      playerSlug: "bradley-barcola",
      playerName: "Bradley Barcola",
      rarity: "limited",
      season: 2024,
      serialNumber: 99,
      boughtPrice: 14.5,
      soldPrice: 28.0,
      soldAt: new Date(now.getTime() - 15 * 24 * 3600 * 1000),
      source: "sorare_sync",
    },
    update: {},
  });

  console.log("✅ Données fictives injectées avec succès !");
}

main()
  .catch((e) => {
    console.error("❌ Erreur pendant l'injection :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
