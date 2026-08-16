/**
 * Shapes shared between the API routes and the client components. Kept free of
 * any server import (Prisma, services) so client components can use them
 * without dragging server code into the browser bundle.
 */

// Pure module, no server import — safe to re-export to the client.
import type { Valuation } from "./valuation";

export interface SquadCard {
  cardSlug: string;
  playerSlug: string;
  name: string;
  position: string;
  rarity: string;
  season: number | null;
  inSeason: boolean;
  serial: number | null;
  bonus: number;
  club: string | null;
  clubSlug: string | null;
  clubPicture: string | null;
  injury: string | null;
  suspended: boolean;
  /** Probability of being in the starting XI — read `pStartBasis` before labelling it. */
  pStart: number | null;
  /** Probability of appearing at all, starter or substitute. */
  pPlay: number | null;
  /**
   * What pStart is built from. "starts" means real starting-XI history;
   * "appearances" means it's standing in for p(plays) and overstates starting;
   * "baseline" means position prior only.
   */
  pStartBasis: "starts" | "appearances" | "baseline" | null;
  /** Sorare's own starter probability, when its data partner has published one. */
  sorareStarterOdds: number | null;
  confidence: number | null;
  expected: number | null;
  floor: number | null;
  l5: number | null;
  l15: number | null;
  note: string | null;
  excluded: boolean;

  picture: string | null;
  country: string | null;
  age: number | null;
  /** ISO date of birth, when the public API has it — powers the U23 badge. */
  birthDate: string | null;
  shirtNumber: number | null;
  sorareProjection: number | null;
  recentScores: number[];
  /** ISO date of the player's most recent recorded appearance, if known. */
  lastPlayedAt: string | null;
  /** The club's domestic league/division, from the public API. */
  competitionSlug: string | null;
  competitionName: string | null;
  /**
   * Already committed to a live or upcoming line-up on Sorare, so it can't be
   * fielded again. Only known when signed in — false otherwise, never null,
   * so the badge simply doesn't show rather than reading as "unknown".
   */
  engagedInLineup?: boolean;
  l10: number | null;
  price: number | null;
  floorPrice: number | null;
  estimatedPrice: number | null;
  boughtPrice: number | null;
  /** True when boughtPrice came from converting a wei amount — shown as an approximation. */
  boughtPriceApprox?: boolean;
  /** How the card entered the gallery: ENGLISH_AUCTION, INSTANT_BUY, REWARD, PACK… */
  acquiredVia?: string | null;
  /** Sorare settled this purchase with conversion credits. */
  paidWithCredits?: boolean;
  /**
   * Cheapest *in-season* card of this player and rarity. For an in-season card
   * this is the meaningful floor — the any-season one is usually an old season
   * trading for cents and makes the card look worthless.
   */
  floorInSeason?: number | null;
  /**
   * What this card actually fetches, from completed sales of the same player,
   * rarity and season eligibility (`lib/valuation.ts`, cached in
   * `PlayerValuation`).
   *
   * This is the figure to trust over `price` / `floorPrice` / `estimatedPrice`,
   * which come from a SorareScore CSV export: they're a snapshot from whenever
   * the export was taken, and their floor is any-season, which read 0,33 € for
   * a Maxime Lopez card trading around 5 € in-season.
   *
   * Null until the valuation sync has covered this market.
   */
  valuation?: Valuation | null;
  /**
   * When the card entered the gallery, from the blockchain ownership record —
   * what "récent" sorts on. Null for cards whose acquisition was never synced.
   */
  acquiredAt?: string | null;
  /**
   * The match this game week's projection is actually about.
   *
   * A starting probability with no visible fixture is a number without its
   * question: 70 % against whom, and when. Null when the player's club isn't
   * playing this game week, which is itself worth seeing.
   */
  nextGame?: NextGame | null;
}

export interface NextGame {
  /** ISO kick-off, when Sorare gave one. */
  date: string | null;
  opponentSlug: string;
  opponentName: string;
  opponentPicture: string | null;
  isHome: boolean;
  /** Opponent's domestic league position — the "is this a hard match" signal. */
  opponentRank: number | null;
}

/**
 * The number to display and reason about for a card, in order of trust:
 * completed sales first, then the CSV's own market price, then its floor.
 *
 * Shared so the gallery, the insights, the season report and the advisor can't
 * drift into valuing the same card differently — which is precisely what they
 * did while each reached for `floorPrice` on its own.
 */
export function cardValue(card: {
  valuation?: Valuation | null;
  price?: number | null;
  floorPrice?: number | null;
}): number | null {
  return card.valuation?.value ?? card.price ?? card.floorPrice ?? null;
}

export type SquadResponse = { fixture: string | null; cards: SquadCard[] };

export const POSITION_SHORT: Record<string, string> = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MIL",
  Forward: "ATT",
};

export const POSITION_LABEL: Record<string, string> = {
  Goalkeeper: "Gardien",
  Defender: "Défenseur",
  Midfielder: "Milieu",
  Forward: "Attaquant",
};

/**
 * Tailwind needs literal class names — `text-${rarity}` would be purged (see
 * tailwind.config.ts's `content` glob, which has to cover this file for these
 * to generate at all).
 *
 * `border` is deliberately `border-l-*` (left-edge only), not `border-*` —
 * the latter is shorthand for all four sides, and consumers pair it with a
 * separate `border-line` on the other three sides. Two same-specificity rules
 * fighting over the same longhand (`border-left-color`) resolve by whichever
 * is later in Tailwind's generated stylesheet, which is alphabetical and not
 * something to depend on — `border-l-*` touches a property `border-line`
 * never sets, so there's nothing to race.
 */
export const RARITY_CLASS: Record<string, { text: string; border: string; bg: string; label: string }> = {
  common: { text: "text-common", border: "border-l-common", bg: "bg-common", label: "Common" },
  limited: { text: "text-limited", border: "border-l-limited", bg: "bg-limited", label: "Limited" },
  rare: { text: "text-rare", border: "border-l-rare", bg: "bg-rare", label: "Rare" },
  super_rare: { text: "text-superrare", border: "border-l-superrare", bg: "bg-superrare", label: "Super Rare" },
  unique: { text: "text-white", border: "border-l-white", bg: "bg-white", label: "Unique" },
};

export const rarityOf = (r: string) => RARITY_CLASS[r] ?? RARITY_CLASS.common;

/** Every rarity Sorare issues — the guard for anything interpolated into a query. */
export const ALL_RARITIES = ["common", "limited", "rare", "super_rare", "unique"] as const;

/**
 * The rarities this manager actually plays, and so the only ones worth
 * *shopping for*: floors, scouting and market search all default to these.
 *
 * Rare, super rare and unique are deliberately out. Each rarity costs its own
 * pair of sub-queries in the floor lookup (any-season and in-season), so
 * dropping three of five turns every price check from ten sub-queries into
 * four, against a complexity cap of 500.
 *
 * This is a *shopping* filter, not a display one. Anything you already own is
 * still shown and still valued whatever its rarity — the gallery is driven by
 * the cards in it, not by this list, so a rare card arriving as a reward can't
 * silently vanish from the portfolio total.
 */
export const TRACKED_RARITIES = ["common", "limited"] as const;

/**
 * The rarity actually competed in, and so the default wherever a screen has to
 * pick exactly one — the watchlist price check, for instance, which belongs to
 * a player rather than to a card and has no rarity of its own to go on.
 */
export const PRIMARY_RARITY = "limited";

/**
 * So5 score bands, aligned with Sorare's own colour coding (roughly: red
 * below 40, neutral 40-59, green 60+) so a number reads the same colour here
 * as it does on Sorare — rather than a colour relative to the player's own
 * average, which made a flat run of bad scores look "fine".
 */
export function scoreColor(score: number | null | undefined): "warn" | "neutral" | "ok" {
  if (score == null) return "neutral";
  if (score < 40) return "warn";
  if (score < 60) return "neutral";
  return "ok";
}

export const SCORE_COLOR_CLASS: Record<ReturnType<typeof scoreColor>, string> = {
  warn: "text-warn",
  neutral: "text-flood",
  ok: "text-ok",
};

/**
 * U23 status from birth date: eligible while under 23, with the "valid
 * until" date being exactly the 23rd birthday. This mirrors the age cut used
 * for U23-restricted competitions, but note Sorare's own per-season cutoff
 * (e.g. tied to a calendar year rather than a rolling birthday) isn't exposed
 * by the public API, so treat this as an approximation, not the official date.
 */
export function u23Status(birthDate: string | null): { eligible: boolean; validUntil: Date } | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;
  const validUntil = new Date(dob);
  validUntil.setFullYear(validUntil.getFullYear() + 23);
  return { eligible: validUntil.getTime() > Date.now(), validUntil };
}

/**
 * Sort value for "trier par U23": the 23rd-birthday timestamp for a
 * currently-eligible player, so ranking naturally reads as "most time left
 * as U23 first" on descending — a manager scanning for prospects worth
 * holding, not just who happens to be under 23 today. Anyone ineligible (or
 * with no known birth date) sorts last via compareNullable, in both directions —
 * "not U23" is never accidentally the top of a U23 sort.
 */
export function u23SortValue(birthDate: string | null): number | null {
  const status = u23Status(birthDate);
  return status?.eligible ? status.validUntil.getTime() : null;
}

/**
 * Comparator for a sortable list column: null/undefined never wins a sort —
 * "unknown" must not read as "smallest" (a card with no price would otherwise
 * jump to the top of a cheapest-first sort) or "largest". It always sorts
 * last, in both directions, and only the direction flips the known values.
 */
export function compareNullable(
  a: number | null | undefined,
  b: number | null | undefined,
  direction: "asc" | "desc"
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return direction === "asc" ? a - b : b - a;
}
