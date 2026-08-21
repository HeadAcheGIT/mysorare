import { prisma } from "../prisma";
import { graphql } from "../sorare/client";
import {
  MY_TRACKS,
  MY_TRACK_TEAMS,
  FIXTURE_DIVISIONS,
  DIVISION_ELIGIBILITY,
  MY_FUNDS,
} from "../sorare/queries";
import { alignedLineupComparison, type ComparisonRow } from "./alignedLineups";

/**
 * The account's real competition structure, synced from Sorare rather than
 * assumed.
 *
 * Before this, "which competitions can I play" was four entries typed by hand
 * into a since-deleted lib/services/rules.ts, with a comment admitting they
 * were starting points rather than fact. That can't reflect a real account:
 * divisions, eligibility and rewards are per-account and change every game
 * week. This reads `so5Fixture.mySo5LeagueTracks` — Sorare's own answer — and
 * stores it so the Compo tab shows the divisions actually open to you, which
 * team sits in which division, and exactly what each one is short of.
 *
 * The optimiser's constraints now come from `SO5_SHAPE` in divisionLineup.ts,
 * not from rules.ts — this module owns the structure that feeds it.
 */

type ValidityNode = {
  value: boolean;
  reason: string | null;
  missingCards: number;
  notEnoughEligibleCards: boolean;
  missingPositions: string[] | null;
  missingAnyRarities: string[] | null;
  transferMarketFilters?: string | null;
};

type RewardsNode = { prizePool: number | null; prizePoolCurrency: string | null } | null;

type LeaderboardNode = {
  slug: string;
  displayName: string | null;
  division: number | null;
  divisionIconUrl: string | null;
  rarityType: string | null;
  seasonality: string | null;
  cutOffDate: string | null;
  mySo5LineupsCount: number | null;
  canCompose: ValidityNode | null;
};

type EligibilityNode = {
  slug: string;
  eligibleCardsCountByPosition:
    | { position: string; seasonality: string | null; totalCount: number; usedCardsCount: number }[]
    | null;
  totalRewards: RewardsNode;
};

type TrackNode = {
  slug: string;
  displayName: string | null;
  seasonality: string | null;
  seasonalityName: string | null;
  maxManagerTeamsCount: number | null;
  unlockedManagerTeamsCount: number | null;
  so5LineupsCount: number | null;
  canCompose: ValidityNode | null;
  totalRewards: RewardsNode;
  so5Leaderboards: { slug: string }[] | null;
};

type TrackTeamsNode = {
  slug: string;
  iconUrl: string | null;
  myManagerTeams:
    | { id: string; name: string | null; activeDivision: number | null; activeDivisionIconUrl: string | null }[]
    | null;
};

type FixtureOf<T> = { so5: { so5Fixture: T | null } };

const json = (v: unknown[] | null | undefined) => (v && v.length ? JSON.stringify(v) : null);
const parseDate = (v: string | null) => (v ? new Date(v) : null);

/**
 * Replaces this fixture's stored structure with what Sorare reports now.
 *
 * Deletes before inserting rather than upserting: a division you're no longer
 * eligible for, or a manager team that moved track, has to *disappear* — an
 * upsert would leave it behind looking current. Everything here is synced
 * data with no local edits, so there's nothing to preserve.
 */
export async function syncDivisions(fixtureSlug: string): Promise<{ tracks: number; divisions: number }> {
  // Four documents rather than one — see MY_TRACKS in lib/sorare/queries.ts
  // for the complexity-cap reason. Sequential because lib/sorare/client.ts
  // paces calls anyway; firing them together would only queue behind itself.
  const trackData = await graphql<FixtureOf<{ mySo5LeagueTracks: TrackNode[] }>>(MY_TRACKS, {
    slug: fixtureSlug,
  });
  const tracks = trackData?.so5?.so5Fixture?.mySo5LeagueTracks ?? [];
  if (!tracks.length) {
    await prisma.syncLog.create({
      data: { job: "divisions", status: "ok", detail: `aucune division · ${fixtureSlug}` },
    });
    return { tracks: 0, divisions: 0 };
  }

  const teamData = await graphql<FixtureOf<{ mySo5LeagueTracks: TrackTeamsNode[] }>>(MY_TRACK_TEAMS, {
    slug: fixtureSlug,
  });
  const teamsByTrack = new Map(
    (teamData?.so5?.so5Fixture?.mySo5LeagueTracks ?? []).map((t) => [t.slug, t])
  );

  const divisionData = await graphql<FixtureOf<{ so5Leaderboards: LeaderboardNode[] }>>(FIXTURE_DIVISIONS, {
    slug: fixtureSlug,
  });
  const leaderboardBySlug = new Map(
    (divisionData?.so5?.so5Fixture?.so5Leaderboards ?? []).map((l) => [l.slug, l])
  );

  const eligibilityData = await graphql<FixtureOf<{ so5Leaderboards: EligibilityNode[] }>>(
    DIVISION_ELIGIBILITY,
    { slug: fixtureSlug }
  );
  const eligibilityBySlug = new Map(
    (eligibilityData?.so5?.so5Fixture?.so5Leaderboards ?? []).map((l) => [l.slug, l])
  );

  await prisma.$transaction([
    // Division first: its rows cascade to DivisionEligibility, and deleting
    // the track alone would miss any division not attached to one.
    prisma.division.deleteMany({ where: { fixtureSlug } }),
    prisma.leagueTrack.deleteMany({ where: { fixtureSlug } }),
    prisma.managerTeam.deleteMany({ where: { fixtureSlug } }),
  ]);

  let divisionCount = 0;

  for (const track of tracks) {
    const teams = teamsByTrack.get(track.slug);

    await prisma.leagueTrack.create({
      data: {
        slug: track.slug,
        fixtureSlug,
        displayName: track.displayName ?? track.slug,
        seasonality: track.seasonality ?? null,
        seasonalityName: track.seasonalityName ?? null,
        canCompose: Boolean(track.canCompose?.value),
        canComposeReason: track.canCompose?.reason ?? null,
        maxManagerTeams: track.maxManagerTeamsCount ?? 0,
        unlockedManagerTeams: track.unlockedManagerTeamsCount ?? 0,
        lineupsCount: track.so5LineupsCount ?? 0,
        prizePool: track.totalRewards?.prizePool ?? null,
        prizePoolCurrency: track.totalRewards?.prizePoolCurrency ?? null,
        iconUrl: teams?.iconUrl ?? null,
      },
    });

    for (const team of teams?.myManagerTeams ?? []) {
      await prisma.managerTeam.create({
        data: {
          id: team.id,
          fixtureSlug,
          trackSlug: track.slug,
          name: team.name ?? track.displayName ?? track.slug,
          activeDivision: team.activeDivision ?? null,
          divisionIconUrl: team.activeDivisionIconUrl ?? null,
          // rarityType/seasonality live on ManagerTeam but cost more than
          // they're worth here — the track's own seasonality already labels
          // the block, so they're left null rather than paid for.
          rarityType: null,
          seasonality: track.seasonality ?? null,
          hidden: false,
        },
      });
    }

    for (const { slug: lbSlug } of track.so5Leaderboards ?? []) {
      // Detail comes from the two fixture-wide documents, matched by slug.
      // A leaderboard the track lists but the fixture query didn't return is
      // skipped rather than written half-empty.
      const lb = leaderboardBySlug.get(lbSlug);
      if (!lb) continue;
      const elig = eligibilityBySlug.get(lbSlug);

      await prisma.division.create({
        data: {
          slug: lb.slug,
          fixtureSlug,
          trackSlug: track.slug,
          displayName: lb.displayName ?? lb.slug,
          division: lb.division ?? null,
          rarityType: lb.rarityType ?? null,
          seasonality: lb.seasonality ?? track.seasonality ?? null,
          cutOffDate: parseDate(lb.cutOffDate),
          canCompose: Boolean(lb.canCompose?.value),
          canComposeReason: lb.canCompose?.reason ?? null,
          missingCards: lb.canCompose?.missingCards ?? 0,
          missingPositions: json(lb.canCompose?.missingPositions),
          missingRarities: json(lb.canCompose?.missingAnyRarities),
          notEnoughEligibleCards: Boolean(lb.canCompose?.notEnoughEligibleCards),
          transferMarketFilters: lb.canCompose?.transferMarketFilters ?? null,
          prizePool: elig?.totalRewards?.prizePool ?? null,
          prizePoolCurrency: elig?.totalRewards?.prizePoolCurrency ?? null,
          divisionIconUrl: lb.divisionIconUrl ?? null,
          myLineupCount: lb.mySo5LineupsCount ?? 0,
        },
      });
      divisionCount++;

      const rows = elig?.eligibleCardsCountByPosition ?? [];
      if (rows.length) {
        await prisma.divisionEligibility.createMany({
          data: rows.map((r) => ({
            fixtureSlug,
            divisionSlug: lb.slug,
            position: r.position,
            seasonality: r.seasonality ?? null,
            totalCount: r.totalCount ?? 0,
            usedCardsCount: r.usedCardsCount ?? 0,
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  await prisma.syncLog.create({
    data: {
      job: "divisions",
      status: "ok",
      detail: `${tracks.length} tracks, ${divisionCount} divisions · ${fixtureSlug}`,
    },
  });

  return { tracks: tracks.length, divisions: divisionCount };
}

export interface EligibilityRow {
  position: string;
  seasonality: string | null;
  totalCount: number;
  usedCardsCount: number;
  /** What's still free to field — the number that actually answers "can I fill this slot". */
  available: number;
}

export interface DivisionView {
  slug: string;
  displayName: string;
  division: number | null;
  rarityType: string | null;
  seasonality: string | null;
  cutOffDate: string | null;
  canCompose: boolean;
  canComposeReason: string | null;
  missingCards: number;
  missingPositions: string[];
  missingRarities: string[];
  notEnoughEligibleCards: boolean;
  transferMarketFilters: string | null;
  prizePool: number | null;
  prizePoolCurrency: string | null;
  divisionIconUrl: string | null;
  eligibility: EligibilityRow[];
  /** The players actually aligned here, with both probability readings. Empty when no line-up is in. */
  lineup: ComparisonRow[];
  hasLineup: boolean;
}

export interface TrackView {
  slug: string;
  displayName: string;
  seasonality: string | null;
  seasonalityName: string | null;
  iconUrl: string | null;
  canCompose: boolean;
  canComposeReason: string | null;
  maxManagerTeams: number;
  unlockedManagerTeams: number;
  lineupsCount: number;
  prizePool: number | null;
  prizePoolCurrency: string | null;
  managerTeams: {
    id: string;
    name: string;
    activeDivision: number | null;
    divisionIconUrl: string | null;
    rarityType: string | null;
    seasonality: string | null;
  }[];
  divisions: DivisionView[];
}

function parseJsonArray(v: string | null): string[] {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** The stored structure joined with what's actually aligned, ready for the board. */
export async function listDivisions(fixtureSlug: string): Promise<TrackView[]> {
  const [tracks, divisions, eligibility, teams, comparison] = await Promise.all([
    prisma.leagueTrack.findMany({ where: { fixtureSlug }, orderBy: { displayName: "asc" } }),
    prisma.division.findMany({ where: { fixtureSlug }, orderBy: [{ division: "asc" }, { displayName: "asc" }] }),
    prisma.divisionEligibility.findMany({ where: { fixtureSlug } }),
    prisma.managerTeam.findMany({ where: { fixtureSlug } }),
    alignedLineupComparison(fixtureSlug),
  ]);

  const lineupByDivision = new Map(comparison.map((g) => [g.leaderboardSlug ?? "", g.rows]));

  const eligibilityByDivision = new Map<string, EligibilityRow[]>();
  for (const e of eligibility) {
    const list = eligibilityByDivision.get(e.divisionSlug) ?? [];
    list.push({
      position: e.position,
      seasonality: e.seasonality,
      totalCount: e.totalCount,
      usedCardsCount: e.usedCardsCount,
      available: Math.max(0, e.totalCount - e.usedCardsCount),
    });
    eligibilityByDivision.set(e.divisionSlug, list);
  }

  const divisionsByTrack = new Map<string, DivisionView[]>();
  for (const d of divisions) {
    const lineup = lineupByDivision.get(d.slug) ?? [];
    const view: DivisionView = {
      slug: d.slug,
      displayName: d.displayName,
      division: d.division,
      rarityType: d.rarityType,
      seasonality: d.seasonality,
      cutOffDate: d.cutOffDate?.toISOString() ?? null,
      canCompose: d.canCompose,
      canComposeReason: d.canComposeReason,
      missingCards: d.missingCards,
      missingPositions: parseJsonArray(d.missingPositions),
      missingRarities: parseJsonArray(d.missingRarities),
      notEnoughEligibleCards: d.notEnoughEligibleCards,
      transferMarketFilters: d.transferMarketFilters,
      prizePool: d.prizePool,
      prizePoolCurrency: d.prizePoolCurrency,
      divisionIconUrl: d.divisionIconUrl,
      eligibility: eligibilityByDivision.get(d.slug) ?? [],
      lineup,
      // myLineupCount is Sorare's own count, so a division reads as "filled"
      // even before the lineup sync has pulled the players themselves.
      hasLineup: lineup.length > 0 || d.myLineupCount > 0,
    };
    const key = d.trackSlug ?? "";
    const list = divisionsByTrack.get(key) ?? [];
    list.push(view);
    divisionsByTrack.set(key, list);
  }

  return tracks.map((t) => ({
    slug: t.slug,
    displayName: t.displayName,
    seasonality: t.seasonality,
    seasonalityName: t.seasonalityName,
    iconUrl: t.iconUrl,
    canCompose: t.canCompose,
    canComposeReason: t.canComposeReason,
    maxManagerTeams: t.maxManagerTeams,
    unlockedManagerTeams: t.unlockedManagerTeams,
    lineupsCount: t.lineupsCount,
    prizePool: t.prizePool,
    prizePoolCurrency: t.prizePoolCurrency,
    managerTeams: teams
      .filter((m) => m.trackSlug === t.slug && !m.hidden)
      .map((m) => ({
        id: m.id,
        name: m.name,
        activeDivision: m.activeDivision,
        divisionIconUrl: m.divisionIconUrl,
        rarityType: m.rarityType,
        seasonality: m.seasonality,
      })),
    divisions: divisionsByTrack.get(t.slug) ?? [],
  }));
}

export interface Funds {
  /** Fiat wallet, in EUR. */
  cashEur: number | null;
  /** ETH wallet converted to EUR by Sorare itself. */
  cryptoEur: number | null;
  /** What's actually spendable, cash + crypto. */
  totalEur: number | null;
  nickname: string | null;
}

/** Spendable balance from Sorare, for the advisor's affordability verdict. */
export async function getFunds(): Promise<Funds> {
  const data = await graphql<{
    currentUser: {
      nickname: string | null;
      availableBalances: {
        eurCents: { eurCents: number | null } | null;
        wei: { wei: string | null; eurCents: number | null } | null;
      } | null;
    } | null;
  }>(MY_FUNDS);

  const balances = data?.currentUser?.availableBalances;
  const cashEur = balances?.eurCents?.eurCents != null ? balances.eurCents.eurCents / 100 : null;
  const cryptoEur = balances?.wei?.eurCents != null ? balances.wei.eurCents / 100 : null;
  const totalEur = cashEur == null && cryptoEur == null ? null : (cashEur ?? 0) + (cryptoEur ?? 0);

  return { cashEur, cryptoEur, totalEur, nickname: data?.currentUser?.nickname ?? null };
}
