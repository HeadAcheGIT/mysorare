import { prisma } from "../prisma";
import { cardValue, type SquadCard } from "../types";

/**
 * Turns a large gallery into a short list of things worth acting on.
 *
 * With 400+ cards the problem isn't missing data, it's that scanning them all
 * every week is impossible. Each rule below answers a question a manager
 * actually asks, and carries the numbers that justify it so the advice can be
 * checked rather than taken on faith.
 */

export type InsightKind = "dead_weight" | "underused" | "sell_high" | "loss" | "unavailable" | "rising";

export interface Insight {
  kind: InsightKind;
  cardSlug: string;
  playerSlug: string;
  name: string;
  picture: string | null;
  club: string | null;
  position: string;
  rarity: string;
  /** ISO date of birth, when known — powers the U23 badge. */
  birthDate: string | null;
  /** The club's domestic league/division, for the championship badge. */
  competitionName: string | null;
  reason: string;
  /// Sort key within a group — bigger means "look at this first".
  weight: number;
  /**
   * What the card is worth, from completed sales when they're known and the
   * CSV export otherwise (see `cardValue`). Was the CSV floor alone, which is
   * an any-season figure: it valued an in-season card at the price of an old
   * season's, and every "loss" and "sell high" here was computed from it.
   */
  value: number | null;
  boughtPrice: number | null;
  expected: number | null;
  pStart: number | null;
}

export interface InsightGroup {
  kind: InsightKind;
  title: string;
  description: string;
  items: Insight[];
}

const eur = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)} €`);
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/**
 * Recent-vs-baseline form trend. Compares the last 3 scores to the 4 before
 * them; needs 6 games so a single good match can't read as a trend.
 */
function trend(scores: number[]): number | null {
  if (scores.length < 6) return null;
  const recent = avg(scores.slice(0, 3));
  const older = avg(scores.slice(3, 7));
  if (recent == null || older == null) return null;
  return recent - older;
}

export async function buildInsights(
  fixtureSlug: string | null
): Promise<{ groups: InsightGroup[]; unenriched: number }> {
  const [cards, players, clubs, projections, valuations] = await Promise.all([
    prisma.card.findMany(),
    prisma.player.findMany(),
    prisma.club.findMany(),
    fixtureSlug ? prisma.projection.findMany({ where: { fixtureSlug } }) : Promise.resolve([]),
    prisma.playerValuation.findMany(),
  ]);

  const playerMap = new Map(players.map((p) => [p.slug, p]));
  const clubMap = new Map(clubs.map((c) => [c.slug, c]));
  const projMap = new Map(projections.map((p) => [p.playerSlug, p]));
  const valuationMap = new Map(valuations.map((v) => [`${v.playerSlug}:${v.rarity}:${v.inSeason}`, v]));

  const dead: Insight[] = [];
  const underused: Insight[] = [];
  const sellHigh: Insight[] = [];
  const losses: Insight[] = [];
  const unavailable: Insight[] = [];
  const rising: Insight[] = [];

  let unenriched = 0;

  for (const c of cards) {
    const p = playerMap.get(c.playerSlug);
    if (!p) continue;

    // A player we've never fetched has no club, no photo and no appearance
    // counts — which is indistinguishable from a player who genuinely has no
    // club and never plays. Judging them would produce confident nonsense
    // (a Premier League starter listed as "sans club"), so they're counted and
    // skipped until enrichment has actually run.
    if (!p.enrichedAt) {
      unenriched++;
      continue;
    }

    const proj = projMap.get(p.slug);
    const club = p.clubSlug ? clubMap.get(p.clubSlug) : null;
    // One figure for the whole loop, so every signal below judges the card on
    // the same number instead of each reaching for the CSV floor.
    const value = cardValue({
      valuation: valuationMap.get(`${c.playerSlug}:${c.rarity}:${c.inSeason}`) ?? null,
      price: c.price,
      floorPrice: c.floorPrice,
    });

    let scores: number[] = [];
    try {
      const parsed = p.recentScores ? JSON.parse(p.recentScores) : [];
      if (Array.isArray(parsed)) scores = parsed.filter((n): n is number => typeof n === "number");
    } catch {
      scores = [];
    }

    const common = {
      cardSlug: c.slug,
      playerSlug: p.slug,
      name: p.displayName,
      picture: p.pictureUrl,
      club: club?.name ?? null,
      position: p.position,
      rarity: c.rarity,
      birthDate: p.birthDate?.toISOString() ?? null,
      competitionName: club?.competitionName ?? null,
      value,
      boughtPrice: c.boughtPrice,
      expected: proj?.expectedScore ?? null,
      pStart: proj?.pStart ?? null,
    };

    const playRate = p.app15 != null ? p.app15 / 15 : null;

    // Injured or suspended, and you own them — the one group that's urgent,
    // because it changes this week's line-up.
    if (p.injuryStatus || p.suspended) {
      unavailable.push({
        ...common,
        kind: "unavailable",
        reason: p.suspended ? "Suspendu" : `Blessé — ${p.injuryStatus}`,
        weight: value ?? 0,
      });
    } else if (!p.clubSlug) {
      dead.push({
        ...common,
        kind: "dead_weight",
        reason: "Sans club — ne peut plus marquer",
        weight: value ?? 0,
      });
    } else if (playRate != null && playRate <= 0.2) {
      // Barely plays: the card can't score, whatever the player's talent.
      dead.push({
        ...common,
        kind: "dead_weight",
        reason: `${p.app15}/15 matchs joués · ${eur(value)}`,
        weight: value ?? 0,
      });
    } else if (playRate != null && playRate >= 0.8 && (p.avgL10Played ?? 0) >= 45) {
      // Plays every week and scores well — worth checking you're fielding it.
      underused.push({
        ...common,
        kind: "underused",
        // Same rule as the UI: only call it "titu" when it came from real
        // starting-XI data, otherwise it's a participation rate (see
        // Projection.pStartBasis).
        reason: `${p.app15}/15 matchs · moyenne ${(p.avgL10Played ?? 0).toFixed(0)} · ${
          proj?.pStartBasis === "starts" ? "titu" : "joue"
        } ${pct(proj?.pStart ?? null)}`,
        weight: (p.avgL10Played ?? 0) * (playRate ?? 0),
      });
    }

    // Valuation signals, only where the CSV carried prices.
    if (value != null && c.boughtPrice != null) {
      const delta = value - c.boughtPrice;
      const ratio = c.boughtPrice > 0 ? delta / c.boughtPrice : 0;
      if (ratio <= -0.35 && c.boughtPrice >= 1) {
        losses.push({
          ...common,
          kind: "loss",
          reason: `${eur(c.boughtPrice)} → ${eur(value)} (${(ratio * 100).toFixed(0)} %)`,
          weight: -delta,
        });
      }
    }

    // Expensive card whose player has stopped delivering: the clearest sell
    // candidate, since the market hasn't caught up with the form yet.
    if (value != null && value >= 3 && p.avgL10Played != null && p.avgL10Played < 35) {
      sellHigh.push({
        ...common,
        kind: "sell_high",
        reason: `${eur(value)} mais moyenne ${p.avgL10Played.toFixed(0)}`,
        weight: value,
      });
    }

    const t = trend(scores);
    if (t != null && t >= 12 && (playRate ?? 0) >= 0.5) {
      rising.push({
        ...common,
        kind: "rising",
        reason: `+${t.toFixed(0)} pts sur les 3 derniers matchs`,
        weight: t,
      });
    }
  }

  const top = (xs: Insight[], n = 12) => xs.sort((a, b) => b.weight - a.weight).slice(0, n);

  const groups: InsightGroup[] = [
    {
      kind: "unavailable",
      title: "Indisponibles",
      description: "Blessés ou suspendus — à sortir de tes compos cette semaine.",
      items: top(unavailable),
    },
    {
      kind: "underused",
      title: "Valeurs sûres",
      description: "Titulaires réguliers et performants : la base de tes compos.",
      items: top(underused),
    },
    {
      kind: "rising",
      title: "En progression",
      description: "Forme en nette hausse sur les derniers matchs.",
      items: top(rising),
    },
    {
      kind: "sell_high",
      title: "À vendre tant que ça vaut",
      description: "Cote élevée mais rendement faible — le marché n'a pas encore corrigé.",
      items: top(sellHigh),
    },
    {
      kind: "dead_weight",
      title: "Poids morts",
      description: "Ne jouent quasiment plus : immobilisent de la valeur pour rien.",
      items: top(dead),
    },
    {
      kind: "loss",
      title: "Moins-values",
      description: "Achetées nettement plus cher que leur cote actuelle.",
      items: top(losses),
    },
  ];

  return { groups: groups.filter((g) => g.items.length > 0), unenriched };
}

/**
 * Portfolio totals for the dashboard header.
 *
 * Summed on the same `cardValue` the rest of the app uses. Summing the CSV
 * floor instead — as this did — understated the whole gallery by however much
 * of it is in-season, since that floor is the cheapest card of *any* season.
 */
export async function portfolioSummary() {
  const [cards, valuations] = await Promise.all([
    prisma.card.findMany({
      select: {
        playerSlug: true,
        rarity: true,
        inSeason: true,
        price: true,
        floorPrice: true,
        boughtPrice: true,
      },
    }),
    prisma.playerValuation.findMany(),
  ]);

  const valuationMap = new Map(valuations.map((v) => [`${v.playerSlug}:${v.rarity}:${v.inSeason}`, v]));

  let value = 0;
  /** Cards with no value at all, so a total built on half the gallery says so. */
  let unvalued = 0;
  for (const c of cards) {
    const v = cardValue({
      valuation: valuationMap.get(`${c.playerSlug}:${c.rarity}:${c.inSeason}`) ?? null,
      price: c.price,
      floorPrice: c.floorPrice,
    });
    if (v == null) unvalued++;
    else value += v;
  }

  const spent = cards.reduce((s, c) => s + (c.boughtPrice ?? 0), 0);
  const byRarity: Record<string, number> = {};
  for (const c of cards) byRarity[c.rarity] = (byRarity[c.rarity] ?? 0) + 1;
  return {
    cards: cards.length,
    value,
    spent,
    delta: spent > 0 ? value - spent : null,
    byRarity,
    unvalued,
  };
}

export type { SquadCard };
