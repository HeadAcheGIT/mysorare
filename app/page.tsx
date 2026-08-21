"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, ApiFetchError } from "@/lib/apiFetch";
import { POSITION_SHORT, PRIMARY_RARITY, cardValue, compareNullable, u23SortValue, type SquadCard, type SquadResponse } from "@/lib/types";
import { matchesSearch, searchTerms } from "@/lib/gallerySearch";
import type { PriceComposition } from "@/lib/accountingRoi";
import PlayerCard from "./components/PlayerCard";
import AlertBadges, { type PlayerAlert } from "./components/AlertBadges";
import MercatoAlerts from "./components/MercatoAlerts";
import { WeekIcon, GalleryIcon, LineupIcon, MarketIcon, HistoryIcon, DataIcon } from "./components/NavIcons";
import PlayerSheet from "./components/PlayerSheet";
import GalleryFilters, { type SortKey, type SortDirection, type DivisionOption, DEFAULT_DIRECTION } from "./components/GalleryFilters";
import SortControl from "./components/SortControl";
import GallerySummary from "./components/GallerySummary";
import CsvImport from "./components/CsvImport";
import SorareLogin from "./components/SorareLogin";
import Deadline, { type GameWeek } from "./components/Deadline";
import InsightList, { type InsightGroup } from "./components/InsightList";
import DataHealth from "./components/DataHealth";
import Scouting from "./components/Scouting";
import PlayerPopup from "./components/PlayerPopup";
import PlayerBadges from "./components/PlayerBadges";
import DivisionBoard from "./components/DivisionBoard";
import InSeasonAdvisor from "./components/InSeasonAdvisor";
import SeasonReport from "./components/SeasonReport";
import AuctionWatch from "./components/AuctionWatch";
import SyncAll from "./components/SyncAll";
import ProjectionAccuracy from "./components/ProjectionAccuracy";
import AccountingImport from "./components/AccountingImport";

type SavedLineup = {
  id: number;
  fixture: string;
  competition: string;
  cards: string[];
  captain: string | null;
  projectedTotal: number;
  createdAt: string;
};

const msg = (e: unknown) => (e instanceof ApiFetchError || e instanceof Error ? e.message : "Erreur inattendue");

/** What /api/market/price answers with when a rarity is given. */
type PriceCheck = {
  floorByRarity: Record<string, number | null>;
  floorInSeasonByRarity?: Record<string, number | null>;
  valuation?: { value: number | null; sampleSize: number; launchPremium: boolean; thin: boolean } | null;
  listedCount: number;
};

/**
 * The one number that answers "what does this cost me".
 *
 * Completed sales first, then the in-season floor, then the any-season one.
 * Showing the any-season floor alone — which is what this screen did — meant
 * a player whose current-season card trades near 6 € displayed 0,33 €, the
 * price of a card from a season you can't field.
 */
function priceHeadline(p: PriceCheck): number | null {
  if (p.valuation?.value != null) return p.valuation.value;
  const inSeason = Object.values(p.floorInSeasonByRarity ?? {}).filter((v): v is number => v != null);
  if (inSeason.length) return Math.min(...inSeason);
  const any = Object.values(p.floorByRarity).filter((v): v is number => v != null);
  return any.length ? Math.min(...any) : null;
}

/**
 * The result of a price check, ordered by how much it can be trusted.
 *
 * The headline is what cards have actually sold for; the floors follow as
 * context. Both watchlists render this, so the two can't drift into showing
 * the same player differently.
 */
function PriceBreakdown({ price }: { price: PriceCheck }) {
  const v = price.valuation ?? null;
  const inSeason = price.floorInSeasonByRarity?.[PRIMARY_RARITY] ?? null;
  const any = price.floorByRarity?.[PRIMARY_RARITY] ?? null;
  const eur = (n: number | null) => (n == null ? null : `${n.toFixed(2)} €`);

  return (
    <div className="mt-2 font-mono text-xs text-muted space-y-0.5">
      {v?.value != null ? (
        <p className="text-fg">
          <span className="text-muted">Valorisation </span>
          <span className="font-bold">{eur(v.value)}</span>
          <span className="text-muted">
            {" "}
            · {v.sampleSize} vente{v.sampleSize > 1 ? "s" : ""} conclue{v.sampleSize > 1 ? "s" : ""}
          </span>
        </p>
      ) : (
        <p>Pas de vente conclue récente — impossible de valoriser.</p>
      )}

      <p>
        {/* An in-season card is only comparable to other in-season cards, so
            the any-season floor is labelled rather than shown bare. */}
        {inSeason != null && <>Floor in-season {eur(inSeason)}</>}
        {inSeason != null && any != null && " · "}
        {any != null && (
          <span className={inSeason != null ? "text-muted/70" : undefined}>
            Floor toutes saisons {eur(any)}
            {inSeason != null && " (autre saison, non comparable)"}
          </span>
        )}
        {inSeason == null && any == null && "Aucune carte en vente actuellement"}
      </p>

      {v?.launchPremium && (
        <p className="text-limited">Sortie récente — les premières séries faussent encore le prix.</p>
      )}
      {v?.thin && <p className="text-warn">Échantillon maigre — ordre de grandeur seulement.</p>}
    </div>
  );
}

export default function Page() {
  const [tab, setTab] = useState<"week" | "gallery" | "lineup" | "market" | "history" | "settings">(
    // Coming back from Sorare Connect: the outcome is rendered by SorareLogin,
    // which only exists on the Données tab. Landing on Semaine instead left the
    // user on a normal-looking screen with no idea what had just happened.
    () =>
      typeof window !== "undefined" && new URLSearchParams(window.location.search).has("sorare")
        ? "settings"
        : "week"
  );
  const [gameWeek, setGameWeek] = useState<GameWeek | null>(null);
  const [insights, setInsights] = useState<InsightGroup[]>([]);
  const [unenriched, setUnenriched] = useState(0);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [fixture, setFixture] = useState<string | null>(null);
  const [squad, setSquad] = useState<SquadCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * True only when the initial squad fetch itself failed — a network or
   * database problem — as opposed to succeeding with zero cards. Both used to
   * render the identical "Aucune donnée, importe ta galerie" prompt, which
   * told a manager with 400 cards to "get started" when the real story was
   * "the database is unreachable" (see humanMessage in lib/apiHandler.ts,
   * which already has a specific message for that case — this is what lets
   * the UI show it instead of burying it under an unrelated CTA).
   */
  const [squadLoadFailed, setSquadLoadFailed] = useState(false);
  const [selected, setSelected] = useState<SquadCard | null>(null);
  const [popupSlug, setPopupSlug] = useState<string | null>(null);
  const [popupExtra, setPopupExtra] = useState<ReactNode>(null);

  /**
   * Single entry point for "a player was clicked", used everywhere a name
   * appears (Semaine insights, Compo results, scouting, search, watchlist).
   * If you own a card for that player, the richer card-specific sheet opens
   * (price paid, your projection) instead of the generic popup — same player,
   * more context, when we have it. `extra` lets a caller (e.g. scouting, with
   * its sale-trend data already in hand) slot context into the popup; it's
   * only used on the popup path since PlayerSheet has its own equivalents.
   */
  const openPlayer = useCallback(
    (playerSlug: string, extra?: ReactNode) => {
      const owned = squad.find((c) => c.playerSlug === playerSlug);
      if (owned) {
        setSelected(owned);
      } else {
        setPopupExtra(extra ?? null);
        setPopupSlug(playerSlug);
      }
    },
    [squad]
  );

  // Gallery controls
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");
  const [rarity, setRarity] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [direction, setDirection] = useState<SortDirection>(DEFAULT_DIRECTION.score);
  const [inSeasonOnly, setInSeasonOnly] = useState(false);
  /**
   * Filter the gallery down to what Sorare says is eligible for one division.
   *
   * `null` means no division filter. Eligibility isn't re-derived locally — a
   * division's bench already accounts for rarity, seasonality and cards
   * committed to another line-up, and guessing at those rules would produce a
   * list that disagrees with Sorare precisely when it matters.
   */
  const [division, setDivision] = useState("");
  const [divisionOptions, setDivisionOptions] = useState<DivisionOption[]>([]);
  const [eligibleCards, setEligibleCards] = useState<Set<string> | null>(null);
  const [divisionLoading, setDivisionLoading] = useState(false);
  const [divisionNote, setDivisionNote] = useState<string | null>(null);
  /** Pagination: a 400-card gallery rendered whole is unusable on a phone. */
  const [page, setPage] = useState(1);

  // Line-up — les compos réelles vivent dans DivisionBoard ; il ne reste ici
  // que la liste des compos sauvegardées par l'ancien composeur, conservée en
  // lecture pour ne rien perdre de ce qui avait été enregistré.
  const [savedLineups, setSavedLineups] = useState<SavedLineup[]>([]);

  // History
  type SaleRow = {
    cardSlug: string;
    playerSlug: string;
    playerName: string;
    rarity: string;
    season: number | null;
    serialNumber: number | null;
    boughtPrice: number | null;
    lastKnownPrice: number | null;
    lastFloorPrice: number | null;
    lastEstimatedPrice: number | null;
    soldPrice: number | null;
    soldAt: string | null;
    soldPriceApprox: boolean;
    boughtPriceApprox: boolean;
    source: string;
    detectedAt: string;
    currentFloor: number | null;
    changePct: number | null;
  };
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  /** Wallet/credit split per card slug, empty until an accounting export is imported. */
  const [compositions, setCompositions] = useState<Record<string, PriceComposition>>({});
  const [salesSyncing, setSalesSyncing] = useState(false);
  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    try {
      const rows = await apiFetch<SaleRow[]>("/api/sales");
      setSales(rows);

      // How each purchase was actually settled. Fetched after the rows rather
      // than joined server-side: the ledger is optional, and the history has
      // to render fully whether or not an export has ever been imported.
      const slugs = rows.map((r) => r.cardSlug).filter(Boolean);
      if (slugs.length) {
        setCompositions(
          await apiFetch<Record<string, PriceComposition>>(
            `/api/accounting?slugs=${encodeURIComponent(slugs.join(","))}`
          ).catch(() => ({}))
        );
      }
    } catch (err) {
      setError(msg(err));
    } finally {
      setSalesLoading(false);
    }
  }, []);

  type SaleSortKey = "date" | "price" | "change";
  const SALE_SORTS: [SaleSortKey, string][] = [
    ["date", "Date"],
    ["price", "Prix de vente"],
    ["change", "Écart vs floor actuel"],
  ];
  const SALE_DEFAULT_DIRECTION: Record<SaleSortKey, SortDirection> = { date: "desc", price: "desc", change: "desc" };
  const [saleSort, setSaleSort] = useState<SaleSortKey>("date");
  const [saleDirection, setSaleDirection] = useState<SortDirection>(SALE_DEFAULT_DIRECTION.date);
  const sortedSales = useMemo(() => {
    return [...sales].sort((a, b) => {
      if (saleSort === "price") {
        const refA = a.soldPrice ?? a.lastKnownPrice ?? a.lastFloorPrice;
        const refB = b.soldPrice ?? b.lastKnownPrice ?? b.lastFloorPrice;
        return compareNullable(refA, refB, saleDirection);
      }
      if (saleSort === "change") {
        return compareNullable(a.changePct, b.changePct, saleDirection);
      }
      const whenA = new Date(a.soldAt ?? a.detectedAt).getTime();
      const whenB = new Date(b.soldAt ?? b.detectedAt).getTime();
      return saleDirection === "asc" ? whenA - whenB : whenB - whenA;
    });
  }, [sales, saleSort, saleDirection]);

  // Recap block: only sales with a confirmed Sorare price count toward the
  // good-call/bad-call tally and the plus/moins-value total — a CSV-estimated
  // row was never a real transaction, so it can't tell you whether selling
  // was the right move.
  const salesRecap = useMemo(() => {
    const confirmed = sales.filter((s) => s.source === "sorare_sync" && s.soldPrice != null);
    const withChange = confirmed.filter((s) => s.changePct != null);
    const goodCalls = withChange.filter((s) => s.changePct! <= 0).length;
    const badCalls = withChange.filter((s) => s.changePct! > 0).length;
    const withProfit = confirmed.filter((s) => s.boughtPrice != null);
    const totalProfit = withProfit.reduce((sum, s) => sum + (s.soldPrice! - s.boughtPrice!), 0);
    const approxCount = confirmed.filter((s) => s.soldPriceApprox).length;
    return {
      confirmedCount: confirmed.length,
      goodCalls,
      badCalls,
      totalProfit,
      profitCount: withProfit.length,
      approxCount,
    };
  }, [sales]);

  async function syncSalesFromSorare() {
    setSalesSyncing(true);
    try {
      await apiFetch("/api/sales/sync", { method: "POST" });
      await loadSales();
    } catch (err) {
      setError(msg(err));
    } finally {
      setSalesSyncing(false);
    }
  }

  // Settings
  const [logs, setLogs] = useState<{ job: string; status: string; detail: string | null; ranAt: string }[]>([]);
  const [tokenStatus, setTokenStatus] = useState<{
    signedIn: boolean;
    expiresAt: string | null;
    kind: "oauth" | "jwt" | null;
    nickname: string | null;
    canReadLineups: boolean;
    oauthConfigured: boolean;
  } | null>(null);
  const [checkingLineups, setCheckingLineups] = useState(false);
  const [syncingFriendlies, setSyncingFriendlies] = useState(false);
  const [importingWatchlists, setImportingWatchlists] = useState(false);
  const [notice, setNotice] = useState("");

  // Market
  const [marketQuery, setMarketQuery] = useState("");
  const [marketResults, setMarketResults] = useState<
    {
      slug: string;
      name: string;
      position: string;
      club: string | null;
      birthDate: string | null;
      competitionName: string | null;
    }[]
  >([]);
  const [marketLoading, setMarketLoading] = useState(false);
  type MarketSortKey = "name" | "position" | "club" | "u23";
  const MARKET_SORTS: [MarketSortKey, string][] = [
    ["name", "Nom"],
    ["position", "Poste"],
    ["club", "Club"],
    ["u23", "U23"],
  ];
  const MARKET_DEFAULT_DIRECTION: Record<MarketSortKey, SortDirection> = {
    name: "asc",
    position: "asc",
    club: "asc",
    u23: "desc",
  };
  const [marketSort, setMarketSort] = useState<MarketSortKey>("name");
  const [marketDirection, setMarketDirection] = useState<SortDirection>(MARKET_DEFAULT_DIRECTION.name);
  const sortedMarketResults = useMemo(() => {
    return [...marketResults].sort((a, b) => {
      if (marketSort === "position") {
        const cmp = a.position.localeCompare(b.position, "fr");
        return marketDirection === "asc" ? cmp : -cmp;
      }
      if (marketSort === "club") {
        const cmp = (a.club ?? "").localeCompare(b.club ?? "", "fr");
        return marketDirection === "asc" ? cmp : -cmp;
      }
      if (marketSort === "u23") {
        return compareNullable(u23SortValue(a.birthDate), u23SortValue(b.birthDate), marketDirection);
      }
      const cmp = a.name.localeCompare(b.name, "fr");
      return marketDirection === "asc" ? cmp : -cmp;
    });
  }, [marketResults, marketSort, marketDirection]);

  type WatchlistSortKey = "name" | "position" | "club" | "price";
  const WATCHLIST_SORTS: [WatchlistSortKey, string][] = [
    ["name", "Nom"],
    ["position", "Poste"],
    ["club", "Club"],
    ["price", "Prix (floor unique)"],
  ];
  const WATCHLIST_DEFAULT_DIRECTION: Record<WatchlistSortKey, SortDirection> = {
    name: "asc",
    position: "asc",
    club: "asc",
    price: "asc",
  };
  const [watchlistSort, setWatchlistSort] = useState<WatchlistSortKey>("name");
  const [watchlistDirection, setWatchlistDirection] = useState<SortDirection>(WATCHLIST_DEFAULT_DIRECTION.name);
  type WatchlistItemRow = {
    playerSlug: string;
    label: string;
    position: string | null;
    club: string | null;
    birthDate: string | null;
    competitionName: string | null;
  };
  type WatchlistGroupRow = { id: number; name: string; items: WatchlistItemRow[] };
  const [watchlistGroups, setWatchlistGroups] = useState<WatchlistGroupRow[]>([]);
  const [activeWatchlistGroup, setActiveWatchlistGroup] = useState<number | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const watchlist = watchlistGroups.find((g) => g.id === activeWatchlistGroup)?.items ?? [];
  const [prices, setPrices] = useState<
    Record<string, PriceCheck | "loading" | "error">
  >({});
  // What the row is worth, in the same order of trust as everywhere else:
  // completed sales, then the in-season floor, then the any-season one. The
  // sort used to take the cheapest floor across rarities, which for an
  // in-season player meant an old season's card — Maxime Lopez sorted at
  // 0,33 € while his in-season market was near 6 €.
  function watchlistPriceFloor(slug: string): number | null {
    const p = prices[slug];
    if (!p || p === "loading" || p === "error") return null;
    return priceHeadline(p);
  }
  const sortedWatchlist = useMemo(() => {
    return [...watchlist].sort((a, b) => {
      if (watchlistSort === "position") {
        const cmp = (a.position ?? "").localeCompare(b.position ?? "", "fr");
        return watchlistDirection === "asc" ? cmp : -cmp;
      }
      if (watchlistSort === "club") {
        const cmp = (a.club ?? "").localeCompare(b.club ?? "", "fr");
        return watchlistDirection === "asc" ? cmp : -cmp;
      }
      if (watchlistSort === "price") {
        return compareNullable(watchlistPriceFloor(a.playerSlug), watchlistPriceFloor(b.playerSlug), watchlistDirection);
      }
      const cmp = a.label.localeCompare(b.label, "fr");
      return watchlistDirection === "asc" ? cmp : -cmp;
    });
  }, [watchlist, watchlistSort, watchlistDirection, prices]);

  const loadSquad = useCallback(async () => {
    try {
      const data = await apiFetch<SquadResponse>("/api/squad");
      setFixture(data.fixture);
      setSquad(data.cards);
      setSquadLoadFailed(false);
    } catch (err) {
      setError(msg(err));
      setSquadLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Which leagues the market scouting tab can actually search — used to flag
  // a player's championship badge as "non couvert" when it can't.
  const [coveredLeagues, setCoveredLeagues] = useState<Set<string>>(new Set());
  const loadCoveredLeagues = useCallback(async () => {
    try {
      const data = await apiFetch<{ leagues: { slug: string }[] }>("/api/scouting");
      setCoveredLeagues(new Set(data.leagues.map((l) => l.slug)));
    } catch {
      // Non-blocking: badges just fall back to showing no coverage indicator.
    }
  }, []);

  // Price-move / transfer-rumor alerts for owned + watchlisted players — see
  // lib/services/alerts.ts. Computed daily by cron, just read here.
  const [alertsBySlug, setAlertsBySlug] = useState<Record<string, PlayerAlert[]>>({});
  const loadAlerts = useCallback(async () => {
    try {
      setAlertsBySlug(await apiFetch<Record<string, PlayerAlert[]>>("/api/alerts"));
    } catch {
      // Non-blocking: alert icons just don't show up.
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      setLogs(await apiFetch("/api/sync-log"));
    } catch (err) {
      setError(msg(err));
    }
  }, []);

  const loadTokenStatus = useCallback(async () => {
    try {
      setTokenStatus(await apiFetch("/api/sorare/signin"));
    } catch {
      // Non-blocking: the gallery works without a Sorare session.
    }
  }, []);

  const loadWatchlist = useCallback(async () => {
    try {
      const groups = await apiFetch<WatchlistGroupRow[]>("/api/watchlist");
      setWatchlistGroups(groups);
      setActiveWatchlistGroup((cur) => (cur != null && groups.some((g) => g.id === cur) ? cur : groups[0]?.id ?? null));
    } catch (err) {
      setError(msg(err));
    }
  }, []);

  const loadGameWeek = useCallback(async () => {
    try {
      setGameWeek(await apiFetch<GameWeek>("/api/gameweek"));
    } catch (err) {
      setError(msg(err));
    }
  }, []);

  const loadInsights = useCallback(async () => {
    try {
      const data = await apiFetch<{ groups: InsightGroup[]; unenriched: number }>("/api/insights");
      setInsights(data.groups);
      setUnenriched(data.unenriched ?? 0);
    } catch (err) {
      setError(msg(err));
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  const loadSavedLineups = useCallback(async (fx: string) => {
    try {
      setSavedLineups(await apiFetch(`/api/lineups?fixture=${encodeURIComponent(fx)}`));
    } catch (err) {
      setError(msg(err));
    }
  }, []);

  useEffect(() => {
    loadSquad();
    loadGameWeek();
    loadInsights();
    loadCoveredLeagues();
    loadAlerts();
  }, [loadSquad, loadGameWeek, loadInsights, loadCoveredLeagues, loadAlerts]);

  useEffect(() => {
    if (tab === "settings") {
      loadLogs();
      loadTokenStatus();
    }
    if (tab === "market") loadWatchlist();
    if (tab === "lineup" && fixture) loadSavedLineups(fixture);
    if (tab === "history") loadSales();
  }, [tab, fixture, loadLogs, loadTokenStatus, loadWatchlist, loadSavedLineups, loadSales]);

  const visible = useMemo(() => {
    // Folded once per query rather than per card: accents and case are
    // normalised, and every word must match somewhere (see lib/gallerySearch).
    const terms = searchTerms(search);
    const list = squad.filter((c) => {
      if (position && c.position !== position) return false;
      if (rarity && c.rarity !== rarity) return false;
      if (inSeasonOnly && !c.inSeason) return false;
      if (eligibleCards && !eligibleCards.has(c.cardSlug)) return false;
      return matchesSearch(c, terms);
    });

    const score = (c: SquadCard) => c.expected ?? c.sorareProjection ?? c.l10;
    const formAvg = (c: SquadCard) =>
      c.recentScores.length ? c.recentScores.reduce((a, b) => a + b, 0) / c.recentScores.length : null;

    return [...list].sort((a, b) => {
      if (sort === "name") {
        const cmp = a.name.localeCompare(b.name, "fr");
        return direction === "asc" ? cmp : -cmp;
      }
      // cardValue, not floorPrice: the CSV floor is an any-season figure, so
      // sorting on it ranked in-season cards by what an old season is worth.
      if (sort === "price") return compareNullable(cardValue(a), cardValue(b), direction);
      if (sort === "form") return compareNullable(formAvg(a), formAvg(b), direction);
      if (sort === "titu") return compareNullable(a.pStart, b.pStart, direction);
      if (sort === "u23") return compareNullable(u23SortValue(a.birthDate), u23SortValue(b.birthDate), direction);
      // Most recently acquired first. Cards whose acquisition was never synced
      // have no date and sort last via compareNullable, rather than pretending
      // to be the oldest.
      if (sort === "recent") {
        const at = (c: SquadCard) => (c.acquiredAt ? Date.parse(c.acquiredAt) : null);
        return compareNullable(at(a), at(b), direction);
      }
      return compareNullable(score(a), score(b), direction);
    });
  }, [squad, search, position, rarity, inSeasonOnly, eligibleCards, sort, direction]);

  // Ten per page: the cards now carry the next match and the value, so a page
  // is meant to be read without scrolling rather than skimmed.
  const PAGE_SIZE = 10;
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  // Clamped rather than reset in an effect: a filter change that shortens the
  // list must never leave the view on a page that no longer exists.
  const currentPage = Math.min(page, pageCount);
  const paged = useMemo(
    () => visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [visible, currentPage]
  );

  // Back to the first page whenever the list itself changes, so narrowing a
  // filter doesn't land on an empty page.
  useEffect(() => {
    setPage(1);
  }, [search, position, rarity, inSeasonOnly, division, sort, direction]);

  /**
   * The divisions available for the eligibility filter.
   *
   * Loaded once per game week when the gallery opens, and only when signed in
   * — divisions come from `currentUser`, so signed out there is simply nothing
   * to offer and the filter hides itself rather than showing an empty select.
   */
  useEffect(() => {
    if (tab !== "gallery" || !fixture || !tokenStatus?.signedIn) return;
    let cancelled = false;
    apiFetch<{ tracks: { displayName: string; divisions: { slug: string; displayName: string }[] }[] }>(
      `/api/divisions?fixture=${encodeURIComponent(fixture)}`
    )
      .then((d) => {
        if (cancelled) return;
        setDivisionOptions(
          d.tracks.flatMap((t) =>
            t.divisions.map((div) => ({ slug: div.slug, label: `${t.displayName} · ${div.displayName}` }))
          )
        );
      })
      // Non-fatal: the gallery is the app's main screen and must not break
      // because an optional filter couldn't populate.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tab, fixture, tokenStatus?.signedIn]);

  /** Reads the chosen division's real bench and keeps its card slugs. */
  useEffect(() => {
    if (!division || !fixture) {
      setEligibleCards(null);
      setDivisionNote(null);
      return;
    }
    let cancelled = false;
    setDivisionLoading(true);
    setDivisionNote(null);
    // validate=0 skips the previewSo5Lineup round trip: this filter needs the
    // bench, not Sorare's verdict on a proposed line-up.
    apiFetch<{ bench: { cardSlug: string | null; locked: boolean }[] }>(
      `/api/divisions/bench?leaderboard=${encodeURIComponent(division)}&fixture=${encodeURIComponent(
        fixture
      )}&validate=0`
    )
      .then((d) => {
        if (cancelled) return;
        const slugs = d.bench.map((b) => b.cardSlug).filter((s): s is string => Boolean(s));
        setEligibleCards(new Set(slugs));
        const locked = d.bench.filter((b) => b.locked).length;
        setDivisionNote(
          `${slugs.length} carte(s) éligible(s)` + (locked > 0 ? ` · ${locked} déjà engagée(s) ailleurs` : "")
        );
      })
      .catch((err) => {
        if (cancelled) return;
        // Showing the whole gallery is the honest fallback — filtering to an
        // empty set would read as "you own nothing eligible".
        setEligibleCards(null);
        setDivisionNote(msg(err));
      })
      .finally(() => {
        if (!cancelled) setDivisionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [division, fixture]);


  async function deleteSavedLineup(id: number) {
    try {
      await apiFetch(`/api/lineups?id=${id}`, { method: "DELETE" });
      setSavedLineups((l) => l.filter((x) => x.id !== id));
    } catch (err) {
      setError(msg(err));
    }
  }

  /** Reloads every view that depends on the stored data. */
  const refreshAll = useCallback(async () => {
    await Promise.all([loadSquad(), loadGameWeek(), loadInsights()]);
  }, [loadSquad, loadGameWeek, loadInsights]);

  async function runLineupCheck() {
    setCheckingLineups(true);
    setNotice("");
    try {
      let cursor = 0;
      let found = 0;
      for (;;) {
        const batch = await apiFetch<{ status: string; detail?: string; found?: number; nextCursor: number | null }>(
          "/api/lineup-check",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cursor }),
          }
        );
        if (batch.status === "error") {
          setNotice(`Erreur : ${batch.detail}`);
          break;
        }
        found += batch.found ?? 0;
        if (batch.nextCursor === null) {
          setNotice(`${found} compo(s) confirmée(s).`);
          break;
        }
        cursor = batch.nextCursor;
      }
      await loadSquad();
    } catch (err) {
      setError(msg(err));
    } finally {
      setCheckingLineups(false);
    }
  }

  async function syncFriendlies() {
    setSyncingFriendlies(true);
    setNotice("");
    try {
      const res = await apiFetch<{
        clubsChecked: number;
        fixturesFound: number;
        appearancesWritten: number;
        partial: boolean;
      }>("/api/friendlies/sync", { method: "POST" });
      setNotice(
        `${res.appearancesWritten} performance(s) sur ${res.fixturesFound} amical(aux), ${res.clubsChecked} clubs.` +
          (res.partial ? " Budget de requêtes atteint — relance pour la suite." : "")
      );
      await loadSquad();
    } catch (err) {
      setError(msg(err));
    } finally {
      setSyncingFriendlies(false);
    }
  }

  async function checkPrice(slug: string) {
    setPrices((p) => ({ ...p, [slug]: "loading" }));
    try {
      // With a rarity the route also returns what those cards have actually
      // sold for, not just what someone is asking. Without one it answered
      // with floors alone — and the watchlist showed the any-season floor,
      // the least useful figure of the three.
      const data = await apiFetch<PriceCheck>(
        `/api/market/price?slug=${encodeURIComponent(slug)}&rarity=${PRIMARY_RARITY}`
      );
      setPrices((p) => ({ ...p, [slug]: data }));
    } catch (err) {
      setPrices((p) => ({ ...p, [slug]: "error" }));
      setError(msg(err));
    }
  }

  async function runMarketSearch() {
    if (marketQuery.trim().length < 2) return;
    setMarketLoading(true);
    try {
      setMarketResults(await apiFetch(`/api/market/search?q=${encodeURIComponent(marketQuery.trim())}`));
    } catch (err) {
      setError(msg(err));
    } finally {
      setMarketLoading(false);
    }
  }

  async function addToWatchlist(p: { slug: string; name: string; position: string; club: string | null }) {
    try {
      await apiFetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerSlug: p.slug,
          label: p.name,
          position: p.position,
          club: p.club,
          groupId: activeWatchlistGroup,
        }),
      });
      await loadWatchlist();
    } catch (err) {
      setError(msg(err));
    }
  }

  async function addWatchlistGroup() {
    if (!newGroupName.trim()) return;
    try {
      const group = await apiFetch<WatchlistGroupRow>("/api/watchlist/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });
      setNewGroupName("");
      await loadWatchlist();
      setActiveWatchlistGroup(group.id);
    } catch (err) {
      setError(msg(err));
    }
  }

  /**
   * Pulls the manager's Sorare watchlists in as local lists.
   *
   * One request — neither the lists nor their players paginate — so no batching
   * loop here, unlike the gallery syncs.
   */
  async function importWatchlists() {
    setImportingWatchlists(true);
    setNotice("");
    try {
      const res = await apiFetch<{
        lists: number;
        groupsCreated: number;
        added: number;
        updated: number;
        details: { name: string; added: number; updated: number }[];
      }>("/api/watchlist/import", { method: "POST" });

      await loadWatchlist();
      setNotice(
        res.lists === 0
          ? "Aucune watchlist trouvée sur ton compte Sorare."
          : `${res.lists} liste(s) Sorare : ${res.added} joueur(s) ajouté(s), ${res.updated} mis à jour` +
              (res.groupsCreated > 0 ? `, ${res.groupsCreated} liste(s) créée(s) ici.` : ".")
      );
    } catch (err) {
      setError(msg(err));
    } finally {
      setImportingWatchlists(false);
    }
  }

  async function deleteWatchlistGroup(id: number) {
    const group = watchlistGroups.find((g) => g.id === id);
    const count = group?.items.length ?? 0;
    const label = group?.name ?? "cette liste";
    if (!window.confirm(`Supprimer « ${label} » ? ${count} joueur${count === 1 ? "" : "s"} suivi${count === 1 ? "" : "s"} seront retirés.`)) {
      return;
    }
    try {
      await apiFetch(`/api/watchlist/groups?id=${id}`, { method: "DELETE" });
      await loadWatchlist();
    } catch (err) {
      setError(msg(err));
    }
  }

  async function removeFromWatchlist(slug: string) {
    if (activeWatchlistGroup == null) return;
    try {
      await apiFetch(
        `/api/watchlist?playerSlug=${encodeURIComponent(slug)}&groupId=${activeWatchlistGroup}`,
        { method: "DELETE" }
      );
      await loadWatchlist();
    } catch (err) {
      setError(msg(err));
    }
  }

  return (
    <div className="min-h-screen flex flex-col safe-top">
      <header className="sticky top-0 z-20 bg-ink2/95 backdrop-blur border-b border-line px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <span className="w-2 h-8 rounded-sm bg-gradient-to-b from-flood to-transparent shrink-0" />
          <div className="min-w-0">
            <h1 className="font-display uppercase text-2xl leading-none tracking-wide">Cockpit</h1>
            <p className="font-mono text-xs text-muted truncate">
              {squad.length
                ? `${squad.length} cartes${fixture ? ` · game week ${fixture}` : ""}`
                : "Galerie vide — importe ton CSV"}
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="sticky top-[57px] z-20 bg-warn/10 border-b border-warn px-4 py-2">
          <div className="max-w-3xl mx-auto flex items-start justify-between gap-3">
            <p className="font-mono text-xs text-warn break-words">{error}</p>
            <button onClick={() => setError(null)} aria-label="Fermer l'erreur" className="text-warn text-xs shrink-0">
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 py-4 pb-24 max-w-3xl w-full mx-auto">
        {tab === "week" && (
          <section aria-label="Cette semaine" className="space-y-4">
            {gameWeek && <Deadline gw={gameWeek} />}
            <DataHealth unenriched={unenriched} onDone={refreshAll} />

            {squad.length === 0 && squadLoadFailed ? (
              <div className="text-center py-4">
                <p className="font-display text-xl uppercase mb-1 text-warn">Galerie indisponible</p>
                <p className="text-sm text-muted">
                  Impossible de vérifier tes cartes pour l&apos;instant — voir le message d&apos;erreur ci-dessus.
                  Rien n&apos;indique que ta galerie est vide.
                </p>
              </div>
            ) : squad.length === 0 ? (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <p className="font-display text-xl uppercase mb-1">Aucune donnée</p>
                  <p className="text-sm text-muted">
                    Importe l&apos;export CSV de ta galerie SorareScore pour démarrer.
                  </p>
                </div>
                <CsvImport onDone={refreshAll} />

            <AccountingImport onImported={loadSales} />
              </div>
            ) : (
              <>
                <GallerySummary cards={squad} />

                {/* Mercato-window transfer alerts, ranked worst-kept-secret
                    first — hides itself entirely when nothing is moving, so
                    it costs nothing outside the transfer window. */}
                <MercatoAlerts squad={squad} alertsBySlug={alertsBySlug} onSelectPlayer={openPlayer} />

                {insightsLoading ? (
                  <p className="font-mono text-sm text-muted">Analyse en cours…</p>
                ) : insights.length === 0 ? (
                  <p className="font-mono text-sm text-muted">
                    Rien à signaler. Lance « Rafraîchir photos et stats » dans Données pour affiner l&apos;analyse.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {insights.map((g) => (
                      <InsightList key={g.kind} group={g} onSelectPlayer={openPlayer} />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {tab === "gallery" && (
          <section aria-label="Ma galerie">
            {loading ? (
              <p className="font-mono text-sm text-muted">Chargement…</p>
            ) : squad.length === 0 && squadLoadFailed ? (
              <div className="text-center py-6">
                <p className="font-display text-xl uppercase mb-1 text-warn">Galerie indisponible</p>
                <p className="text-sm text-muted">
                  Impossible de vérifier tes cartes pour l&apos;instant — voir le message d&apos;erreur ci-dessus.
                  Rien n&apos;indique que ta galerie est vide.
                </p>
              </div>
            ) : squad.length === 0 ? (
              <div className="space-y-4">
                <div className="text-center py-6">
                  <p className="font-display text-xl uppercase mb-1">Aucune carte</p>
                  <p className="text-sm text-muted">
                    Importe l&apos;export CSV de ta galerie SorareScore pour démarrer.
                  </p>
                </div>
                <CsvImport onDone={refreshAll} />

            <AccountingImport onImported={loadSales} />
              </div>
            ) : (
              <>
                <GallerySummary cards={squad} />
                <GalleryFilters
                  search={search}
                  onSearch={setSearch}
                  position={position}
                  onPosition={setPosition}
                  rarity={rarity}
                  onRarity={setRarity}
                  sort={sort}
                  onSort={setSort}
                  direction={direction}
                  onDirection={setDirection}
                  inSeasonOnly={inSeasonOnly}
                  onInSeasonOnly={setInSeasonOnly}
                  divisions={divisionOptions}
                  division={division}
                  onDivision={setDivision}
                  divisionLoading={divisionLoading}
                  divisionNote={divisionNote}
                />
                <p className="font-mono text-xs text-muted mb-2">
                  {visible.length} carte{visible.length > 1 ? "s" : ""}
                  {pageCount > 1 && ` · page ${currentPage}/${pageCount}`}
                </p>
                <ul className="flex flex-col gap-2">
                  {paged.map((c) => (
                    <PlayerCard
                      key={c.cardSlug}
                      card={c}
                      onSelect={setSelected}
                      coveredLeagues={coveredLeagues}
                      alerts={alertsBySlug[c.playerSlug]}
                    />
                  ))}
                </ul>
                {pageCount > 1 && (
                  <div className="flex items-center justify-between gap-2 mt-3">
                    <button
                      onClick={() => setPage(currentPage - 1)}
                      disabled={currentPage <= 1}
                      className="text-xs border border-line rounded-md px-3 py-2 disabled:opacity-40"
                    >
                      ← Précédent
                    </button>
                    <span className="font-mono text-xs text-muted">
                      {currentPage} / {pageCount}
                    </span>
                    <button
                      onClick={() => setPage(currentPage + 1)}
                      disabled={currentPage >= pageCount}
                      className="text-xs border border-line rounded-md px-3 py-2 disabled:opacity-40"
                    >
                      Suivant →
                    </button>
                  </div>
                )}
                {visible.length === 0 && (
                  <p className="font-mono text-sm text-muted">Aucune carte ne correspond à ce filtre.</p>
                )}
              </>
            )}
          </section>
        )}

        {tab === "lineup" && (
          <section aria-label="Composition">
            {/* Le sélecteur de compétitions et le bouton « Composer » ont été
                retirés : ils tournaient sur quatre compétitions écrites à la
                main dans lib/services/rules.ts et proposaient donc des compos
                pour des compétitions qui n'existent pas forcément sur le
                compte. Les vraies divisions, avec leur vivier réel et une
                compo proposée validée par Sorare, sont dans DivisionBoard
                ci-dessous. */}
            {/* Placed with the line-ups on purpose: this is the scoreboard for
                every probability the tab above just used to recommend one. */}
            <div className="mt-6 pt-4 border-t border-line">
              <ProjectionAccuracy />
            </div>

            {savedLineups.length > 0 && (
              <div className="mt-6">
                <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">Compos sauvegardées</h2>
                <ul className="flex flex-col gap-2">
                  {savedLineups.map((l) => (
                    <li
                      key={l.id}
                      className="p-3 rounded-lg bg-ink2 border border-line flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-bold truncate">
                          {l.competition} · <span className="text-flood">{l.projectedTotal}</span> pts
                        </p>
                        <p className="text-xs text-muted truncate">
                          {new Date(l.createdAt).toLocaleString("fr-FR")} · {l.cards.length} cartes
                        </p>
                      </div>
                      <button
                        onClick={() => deleteSavedLineup(l.id)}
                        className="shrink-0 text-xs text-warn border border-warn rounded-md px-2 py-1.5"
                      >
                        Suppr.
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6">
              <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">
                Mes divisions
              </h2>
              <DivisionBoard
                currentFixture={gameWeek?.fixture ?? null}
                onSelectPlayer={openPlayer}
                onError={setError}
              />
            </div>

            <div className="mt-6">
              <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">
                Où me lancer en in-season
              </h2>
              <InSeasonAdvisor fixture={gameWeek?.fixture ?? null} onError={setError} />
            </div>
          </section>
        )}

        {tab === "market" && (
          <section aria-label="Marché" className="space-y-6">
            <div>
              <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">
                Scouting par championnat
              </h2>
              <Scouting onError={setError} onSelectPlayer={openPlayer} />
            </div>

            <div>
              <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">
                Recherche par nom
              </h2>
            <div className="flex gap-2 mb-4">
              <input
                value={marketQuery}
                onChange={(e) => setMarketQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runMarketSearch()}
                placeholder="Chercher un joueur…"
                aria-label="Chercher un joueur sur le marché"
                className="flex-1 bg-ink border border-line rounded-md px-3 py-2 text-sm"
              />
              <button
                onClick={runMarketSearch}
                disabled={marketLoading}
                className="bg-flood text-ink font-bold px-4 py-2 rounded-md text-sm disabled:opacity-50"
              >
                {marketLoading ? "…" : "Chercher"}
              </button>
            </div>

            {marketResults.length > 0 && (
              <>
                <div className="mb-2">
                  <SortControl
                    sortKey={marketSort}
                    onSortKey={(k) => {
                      setMarketSort(k);
                      setMarketDirection(MARKET_DEFAULT_DIRECTION[k]);
                    }}
                    options={MARKET_SORTS}
                    direction={marketDirection}
                    onDirection={setMarketDirection}
                  />
                </div>
                <ul className="flex flex-col gap-2 mb-6">
                {sortedMarketResults.map((p) => {
                  const price = prices[p.slug];
                  return (
                    <li key={p.slug} className="p-3 rounded-lg bg-ink2 border border-line">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => openPlayer(p.slug)}
                          className="min-w-0 text-left hover:underline decoration-muted underline-offset-2"
                        >
                          <p className="font-bold truncate flex items-center gap-1.5">
                            {p.name}
                            <AlertBadges alerts={alertsBySlug[p.slug]} />
                          </p>
                          <p className="text-xs text-muted truncate">
                            {POSITION_SHORT[p.position] ?? p.position} · {p.club ?? "—"}
                          </p>
                          <p className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <PlayerBadges birthDate={p.birthDate} competitionName={p.competitionName} />
                          </p>
                        </button>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => checkPrice(p.slug)}
                            className="text-xs border border-line rounded-md px-2 py-1.5"
                          >
                            {price === "loading" ? "…" : "Prix"}
                          </button>
                          {!watchlist.some((w) => w.playerSlug === p.slug) && (
                            <button
                              onClick={() => addToWatchlist(p)}
                              className="text-xs bg-flood text-ink font-bold rounded-md px-2 py-1.5"
                            >
                              + Suivre
                            </button>
                          )}
                        </div>
                      </div>
                      {price && price !== "loading" && price !== "error" && (
                        <PriceBreakdown price={price} />
                      )}
                      {price === "error" && <p className="mt-2 text-xs text-warn">Erreur de lecture du marché</p>}
                    </li>
                  );
                })}
                </ul>
              </>
            )}

            </div>

            <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">
              Enchères sur mes joueurs suivis
            </h2>
            <div className="mb-6">
              <AuctionWatch onSelectPlayer={openPlayer} onError={setError} />
            </div>

            <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">Mes listes de suivi</h2>

            <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1" role="tablist" aria-label="Listes de suivi">
              {watchlistGroups.map((g) => (
                <button
                  key={g.id}
                  role="tab"
                  aria-selected={activeWatchlistGroup === g.id}
                  onClick={() => setActiveWatchlistGroup(g.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-mono border ${
                    activeWatchlistGroup === g.id
                      ? "bg-flood text-ink border-flood font-bold"
                      : "border-line text-muted"
                  }`}
                >
                  {g.name} ({g.items.length})
                </button>
              ))}
              {watchlistGroups.length > 1 && activeWatchlistGroup != null && (
                <button
                  onClick={() => deleteWatchlistGroup(activeWatchlistGroup)}
                  aria-label="Supprimer cette liste"
                  className="shrink-0 text-xs text-warn border border-warn rounded-md px-2 py-1.5"
                >
                  Suppr. liste
                </button>
              )}
            </div>

            <div className="flex gap-2 mb-4">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addWatchlistGroup()}
                placeholder="Nouvelle liste (ex: Cibles Ligue 1)"
                aria-label="Nom de la nouvelle liste de suivi"
                className="flex-1 bg-ink border border-line rounded-md px-3 py-2 text-sm"
              />
              <button
                onClick={addWatchlistGroup}
                className="text-xs border border-line rounded-md px-3 py-2"
              >
                + Liste
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={importWatchlists}
                disabled={importingWatchlists}
                className="text-xs border border-line rounded-md px-3 py-2 disabled:opacity-50"
              >
                {importingWatchlists ? "Import…" : "⇩ Importer mes watchlists Sorare"}
              </button>
              <p className="font-mono text-[10px] text-muted flex-1">
                Reprend tes listes Sorare telles quelles. Ajoute et met à jour, ne supprime jamais — tes
                listes créées ici sont conservées. Connexion Sorare requise.
              </p>
            </div>

            {watchlist.length > 0 && (
              <div className="mb-2">
                <SortControl
                  sortKey={watchlistSort}
                  onSortKey={(k) => {
                    setWatchlistSort(k);
                    setWatchlistDirection(WATCHLIST_DEFAULT_DIRECTION[k]);
                  }}
                  options={WATCHLIST_SORTS}
                  direction={watchlistDirection}
                  onDirection={setWatchlistDirection}
                />
              </div>
            )}

            <ul className="flex flex-col gap-2">
              {sortedWatchlist.map((w) => {
                const price = prices[w.playerSlug];
                return (
                  <li key={w.playerSlug} className="p-3 rounded-lg bg-ink2 border border-line">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openPlayer(w.playerSlug)}
                        className="min-w-0 text-left hover:underline decoration-muted underline-offset-2"
                      >
                        <p className="font-bold truncate flex items-center gap-1.5">
                          {w.label}
                          <AlertBadges alerts={alertsBySlug[w.playerSlug]} />
                        </p>
                        <p className="text-xs text-muted truncate">
                          {w.position ? POSITION_SHORT[w.position] ?? w.position : ""}
                          {w.club ? ` · ${w.club}` : ""}
                        </p>
                        <p className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <PlayerBadges birthDate={w.birthDate} competitionName={w.competitionName} />
                        </p>
                      </button>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => checkPrice(w.playerSlug)}
                          className="text-xs border border-line rounded-md px-2 py-1.5"
                        >
                          {price === "loading" ? "…" : "Prix"}
                        </button>
                        <button
                          onClick={() => removeFromWatchlist(w.playerSlug)}
                          className="text-xs text-warn border border-warn rounded-md px-2 py-1.5"
                        >
                          Retirer
                        </button>
                      </div>
                    </div>
                    {price && price !== "loading" && price !== "error" && (
                      <PriceBreakdown price={price} />
                    )}
                    {price === "error" && <p className="mt-2 text-xs text-warn">Erreur de lecture du marché</p>}
                  </li>
                );
              })}
              {watchlist.length === 0 && (
                <p className="font-mono text-sm text-muted">
                  Cherche un joueur ci-dessus et tape « + Suivre » pour l&apos;ajouter ici.
                </p>
              )}
            </ul>
          </section>
        )}

        {tab === "history" && (
          <section aria-label="Historique" className="space-y-3">
            <div className="mb-6">
              <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">
                Bilan de la saison
              </h2>
              <SeasonReport onError={setError} />
            </div>

            <h2 className="font-display uppercase text-sm tracking-wide text-muted">Ventes</h2>
            <p className="font-mono text-xs text-muted mb-2">
              Cartes disparues de ta galerie — vendues ou transférées. « Synchroniser » va chercher tes vraies
              ventes chez Sorare (prix et date confirmés, historique complet) ; sans connexion, seule ta dernière
              valorisation SorareScore avant disparition est affichée, en estimation.
            </p>

            <button
              onClick={syncSalesFromSorare}
              disabled={salesSyncing}
              className="w-full border border-line font-bold py-2.5 rounded-md text-sm disabled:opacity-50"
            >
              {salesSyncing ? "Synchronisation…" : "Synchroniser depuis Sorare"}
            </button>

            {salesLoading && <p className="font-mono text-sm text-muted">Chargement…</p>}

            {!salesLoading && sales.length === 0 && (
              <p className="font-mono text-sm text-muted">Aucune carte vendue ou transférée détectée pour l&apos;instant.</p>
            )}

            {salesRecap.confirmedCount > 0 && (
              <div className="p-3 rounded-lg bg-ink2 border border-line grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted">Bons calls</p>
                  <p className="font-display text-lg text-ok">
                    {salesRecap.goodCalls}
                    <span className="text-muted text-xs">/{salesRecap.goodCalls + salesRecap.badCalls}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted">Plus/moins-value</p>
                  <p className={`font-display text-lg ${salesRecap.totalProfit >= 0 ? "text-ok" : "text-warn"}`}>
                    {salesRecap.profitCount > 0 ? (
                      <>
                        {salesRecap.totalProfit >= 0 ? "+" : ""}
                        {salesRecap.totalProfit.toFixed(2)} €
                      </>
                    ) : (
                      <span className="text-muted text-sm">—</span>
                    )}
                  </p>
                </div>
                <p className="col-span-2 text-[11px] font-mono text-muted">
                  {salesRecap.confirmedCount} vente{salesRecap.confirmedCount === 1 ? "" : "s"} confirmée
                  {salesRecap.confirmedCount === 1 ? "" : "s"} par Sorare
                  {salesRecap.profitCount < salesRecap.confirmedCount &&
                    ` (${salesRecap.confirmedCount - salesRecap.profitCount} sans prix d'achat connu)`}
                  {salesRecap.approxCount > 0 &&
                    ` · ${salesRecap.approxCount} converti${salesRecap.approxCount === 1 ? "" : "s"} depuis l'ETH (≈)`}
                </p>
              </div>
            )}

            {sales.length > 0 && (
              <SortControl
                sortKey={saleSort}
                onSortKey={(k) => {
                  setSaleSort(k);
                  setSaleDirection(SALE_DEFAULT_DIRECTION[k]);
                }}
                options={SALE_SORTS}
                direction={saleDirection}
                onDirection={setSaleDirection}
              />
            )}

            <ul className="flex flex-col gap-2">
              {sortedSales.map((s) => {
                const confirmed = s.source === "sorare_sync" && s.soldPrice != null;
                const reference = s.soldPrice ?? s.lastKnownPrice ?? s.lastFloorPrice;
                const profit = confirmed && s.boughtPrice != null ? s.soldPrice! - s.boughtPrice : null;
                const when = s.soldAt ?? s.detectedAt;
                return (
                  <li key={s.cardSlug} className="p-3 rounded-lg bg-ink2 border border-line">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openPlayer(s.playerSlug)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="font-bold truncate">{s.playerName}</p>
                        <p className="text-xs text-muted truncate">
                          {s.rarity}
                          {s.season != null && ` · saison ${s.season}`}
                          {s.serialNumber != null && ` · #${s.serialNumber}`}
                          {" · "}
                          {new Date(when).toLocaleDateString("fr-FR")}
                        </p>
                      </button>
                      <a
                        href={`https://sorare.com/football/cards/${s.cardSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 text-xs text-muted border border-line rounded-md px-2 py-1 hover:text-white hover:border-flood/60"
                        aria-label={`Voir la carte de ${s.playerName} sur Sorare`}
                      >
                        Carte ↗
                      </a>
                    </div>

                    <div className="mt-2 font-mono text-xs flex flex-wrap gap-x-4 gap-y-1 text-muted">
                      {s.boughtPrice != null && (
                        <span>
                          Acheté {s.boughtPrice.toFixed(2)} €{s.boughtPriceApprox && (
                            <span title="Converti depuis un montant en ETH au cours du jour de l'achat (CoinGecko)"> ≈</span>
                          )}
                        </span>
                      )}
                      {confirmed ? (
                        <span className="text-white">
                          Vendu {s.soldPrice!.toFixed(2)} €{s.soldPriceApprox && (
                            <span title="Converti depuis un montant en ETH au cours du jour de la vente (CoinGecko)"> ≈</span>
                          )}
                        </span>
                      ) : (
                        reference != null && <span>Dernière valo (estimation) {reference.toFixed(2)} €</span>
                      )}
                      {s.currentFloor != null && <span>Floor actuel {s.currentFloor.toFixed(2)} €</span>}
                    </div>

                    {/* What the purchase was actually made of. The price and
                        the cash that left the wallet are different numbers
                        whenever credits were involved, and only the second one
                        is real money out. */}
                    {compositions[s.cardSlug] && (
                      <p className="mt-1 font-mono text-[11px]">
                        {compositions[s.cardSlug].credit > 0 ? (
                          <>
                            <span className="text-muted">dont </span>
                            <span className="text-fg">
                              {compositions[s.cardSlug].wallet.toFixed(2)} € portefeuille
                            </span>
                            <span className="text-muted"> + </span>
                            <span className="text-limited">
                              {compositions[s.cardSlug].credit.toFixed(2)} € crédits
                            </span>
                            <span className="text-muted"> ({compositions[s.cardSlug].creditPct} %)</span>
                          </>
                        ) : (
                          <span className="text-muted">
                            payé intégralement du portefeuille ({compositions[s.cardSlug].wallet.toFixed(2)} €)
                          </span>
                        )}
                      </p>
                    )}

                    {profit != null && (
                      <p className={`mt-1 text-xs font-mono ${profit >= 0 ? "text-ok" : "text-warn"}`}>
                        {profit >= 0 ? "+" : ""}
                        {profit.toFixed(2)} € vs achat
                      </p>
                    )}

                    {s.changePct != null ? (
                      <p className={`mt-1 text-xs font-mono ${s.changePct > 0 ? "text-warn" : "text-ok"}`}>
                        {s.changePct > 0
                          ? `Le prix a monté de ${s.changePct.toFixed(0)}% depuis — vendre était discutable`
                          : `Le prix a baissé de ${Math.abs(s.changePct).toFixed(0)}% depuis — bon call`}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs font-mono text-muted">Pas assez de données pour comparer</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {tab === "settings" && (
          <section aria-label="Données" className="space-y-3">
            <CsvImport onDone={refreshAll} />

            <AccountingImport onImported={loadSales} />

            <SyncAll
              fixture={fixture}
              signedIn={Boolean(tokenStatus?.signedIn)}
              onDone={async (summary) => {
                await refreshAll();
                await loadLogs();
                setNotice(summary);
              }}
              onError={(m) => setError(m)}
            />

            {/* Kept apart from the Sorare button on purpose: both of these come
                from API-Football, so folding them in would make a "synchroniser
                avec Sorare" run fail on a missing APIFOOTBALL_KEY. */}
            <div className="pt-2 border-t border-line space-y-3">
              <h2 className="font-display uppercase text-sm tracking-wide text-muted">Autres sources</h2>

              <button
                onClick={runLineupCheck}
                disabled={checkingLineups}
                className="w-full border border-line font-bold py-3 rounded-md text-sm disabled:opacity-50"
              >
                {checkingLineups ? "Vérification…" : "Vérifier les compos officielles"}
              </button>
              <p className="font-mono text-xs text-muted">
                Utile seulement ~90 min avant le coup d&apos;envoi. Nécessite APIFOOTBALL_KEY.
              </p>

              <button
                onClick={syncFriendlies}
                disabled={syncingFriendlies}
                className="w-full border border-line font-bold py-3 rounded-md text-sm disabled:opacity-50"
              >
                {syncingFriendlies ? "Récupération…" : "Récupérer les matchs de préparation"}
              </button>
              <p className="font-mono text-xs text-muted">
                Minutes, buts et passes de tes joueurs en amicaux de club — l&apos;API Sorare ne les couvre
                pas, ceux-ci viennent d&apos;API-Football (nécessite APIFOOTBALL_KEY, ~1 requête par club puis
                1 par match sur les 100/jour gratuites). À lancer une fois par semaine pendant la préparation.
              </p>
            </div>

            {notice && <p className="font-mono text-xs text-ok">{notice}</p>}

            <SorareLogin status={tokenStatus} onSignedIn={loadTokenStatus} />

            <div>
              <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">Journal</h2>
              <ul className="flex flex-col gap-2 font-mono text-xs">
                {logs.map((l, i) => (
                  <li key={i} className="border-b border-line pb-2 flex justify-between gap-2">
                    <span className={l.status === "error" ? "text-warn" : "text-ok"}>
                      {l.status} · {l.job}
                      {l.detail ? ` · ${l.detail}` : ""}
                    </span>
                    <span className="text-muted shrink-0">{new Date(l.ranAt).toLocaleString("fr-FR")}</span>
                  </li>
                ))}
                {logs.length === 0 && <li className="text-muted">Aucune opération enregistrée.</li>}
              </ul>
            </div>
          </section>
        )}
      </main>

      {selected && <PlayerSheet card={selected} onClose={() => setSelected(null)} />}
      {popupSlug && (
        <PlayerPopup
          slug={popupSlug}
          extra={popupExtra}
          onClose={() => {
            setPopupSlug(null);
            setPopupExtra(null);
          }}
        />
      )}

      <nav className="fixed bottom-0 inset-x-0 bg-ink2 border-t border-line safe-bottom z-30">
        <div className="max-w-3xl mx-auto flex">
          {(
            [
              ["week", "Semaine", WeekIcon],
              ["gallery", "Galerie", GalleryIcon],
              ["lineup", "Compo", LineupIcon],
              ["market", "Marché", MarketIcon],
              ["history", "Historique", HistoryIcon],
              ["settings", "Données", DataIcon],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={`flex-1 min-h-[48px] py-2 flex flex-col items-center justify-center gap-0.5 text-[11px] font-display uppercase tracking-wide border-t-2 ${
                tab === key ? "text-flood border-flood" : "text-muted border-transparent"
              }`}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
