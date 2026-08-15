"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, ApiFetchError } from "@/lib/apiFetch";
import { POSITION_SHORT, compareNullable, u23SortValue, type SquadCard, type SquadResponse } from "@/lib/types";
import PlayerCard from "./components/PlayerCard";
import AlertBadges, { type PlayerAlert } from "./components/AlertBadges";
import { WeekIcon, GalleryIcon, LineupIcon, MarketIcon, HistoryIcon, DataIcon } from "./components/NavIcons";
import PlayerSheet from "./components/PlayerSheet";
import GalleryFilters, { type SortKey, type SortDirection, DEFAULT_DIRECTION } from "./components/GalleryFilters";
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

export default function Page() {
  const [tab, setTab] = useState<"week" | "gallery" | "lineup" | "market" | "history" | "settings">("week");
  const [gameWeek, setGameWeek] = useState<GameWeek | null>(null);
  const [insights, setInsights] = useState<InsightGroup[]>([]);
  const [unenriched, setUnenriched] = useState(0);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [fixture, setFixture] = useState<string | null>(null);
  const [squad, setSquad] = useState<SquadCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  const [salesSyncing, setSalesSyncing] = useState(false);
  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    try {
      setSales(await apiFetch<SaleRow[]>("/api/sales"));
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
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [checkingLineups, setCheckingLineups] = useState(false);
  const [syncingFriendlies, setSyncingFriendlies] = useState(false);
  const [syncingForm, setSyncingForm] = useState(false);
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
    Record<string, { floorByRarity: Record<string, number | null>; listedCount: number } | "loading" | "error">
  >({});
  // Cheapest fetched floor across rarities — "prix" sort only has something to
  // work with once "Prix" has been clicked on a row, so unpriced items sort
  // last via compareNullable rather than looking arbitrarily unordered.
  function watchlistPriceFloor(slug: string): number | null {
    const p = prices[slug];
    if (!p || p === "loading" || p === "error") return null;
    const values = Object.values(p.floorByRarity).filter((v): v is number => v != null);
    return values.length ? Math.min(...values) : null;
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
    } catch (err) {
      setError(msg(err));
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
    const q = search.trim().toLowerCase();
    const list = squad.filter((c) => {
      if (position && c.position !== position) return false;
      if (rarity && c.rarity !== rarity) return false;
      if (inSeasonOnly && !c.inSeason) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.club ?? "").toLowerCase().includes(q);
    });

    const score = (c: SquadCard) => c.expected ?? c.sorareProjection ?? c.l10;
    const formAvg = (c: SquadCard) =>
      c.recentScores.length ? c.recentScores.reduce((a, b) => a + b, 0) / c.recentScores.length : null;

    return [...list].sort((a, b) => {
      if (sort === "name") {
        const cmp = a.name.localeCompare(b.name, "fr");
        return direction === "asc" ? cmp : -cmp;
      }
      if (sort === "price") return compareNullable(a.floorPrice, b.floorPrice, direction);
      if (sort === "form") return compareNullable(formAvg(a), formAvg(b), direction);
      if (sort === "titu") return compareNullable(a.pStart, b.pStart, direction);
      if (sort === "u23") return compareNullable(u23SortValue(a.birthDate), u23SortValue(b.birthDate), direction);
      return compareNullable(score(a), score(b), direction);
    });
  }, [squad, search, position, rarity, inSeasonOnly, sort, direction]);


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

  /**
   * Refreshes photos/stats from the public API, then recomputes the game week
   * and projections. No Sorare login involved at any step.
   */
  async function refreshStats() {
    setSyncing(true);
    setNotice("");
    try {
      let guard = 0;
      for (;;) {
        const batch = await apiFetch<{ processed: number; remaining: number; total: number; failed: number }>(
          "/api/enrich",
          { method: "POST" }
        );
        setNotice(`${batch.total - batch.remaining}/${batch.total} joueurs`);
        if (batch.failed > 0) throw new Error(`${batch.failed} lot(s) en échec — voir le Journal pour le détail.`);
        if (batch.remaining === 0 || batch.processed === 0) break;
        if (++guard > 60) break;
      }

      setNotice("Calcul des projections…");
      const gw = await apiFetch<{ fixture: string | null; updated: number }>("/api/gameweek", { method: "POST" });

      await refreshAll();
      await loadLogs();
      setNotice(`À jour — ${gw.updated} projections pour ${gw.fixture ?? "la game week"}.`);
    } catch (err) {
      setError(msg(err));
    } finally {
      setSyncing(false);
    }
  }

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

  /**
   * Pulls per-game history so the starting probability can be built from real
   * compositions instead of appearance counts, which can't tell a substitute
   * from a starter. Public since PLAYER_FORM moved to `anyPlayer`, so no
   * Sorare login is needed.
   *
   * One API call per player against a 20/min unauthenticated limit, so a large
   * gallery takes a while — the loop is resumable via its cursor, and stopping
   * early just means fewer players upgraded, never corrupt data.
   */
  async function syncForm() {
    setSyncingForm(true);
    setNotice("");
    try {
      let cursor = 0;
      let guard = 0;
      for (;;) {
        const batch = await apiFetch<{
          status: string;
          detail?: string;
          processed: number;
          nextCursor: number | null;
          total: number;
        }>("/api/sync/batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cursor }),
        });
        if (batch.status === "error") throw new Error(batch.detail ?? "Erreur de synchronisation");
        setNotice(`Compositions : ${Math.min(cursor + batch.processed, batch.total)}/${batch.total} joueurs`);
        if (batch.nextCursor == null) break;
        cursor = batch.nextCursor;
        if (++guard > 400) break;
      }
      // Projections have to be recomputed for the new start data to reach the UI.
      const gw = await apiFetch<{ fixture: string | null; updated: number }>("/api/gameweek", { method: "POST" });
      await refreshAll();
      await loadLogs();
      setNotice(`Compositions synchronisées — ${gw.updated} projections recalculées.`);
    } catch (err) {
      setError(msg(err));
    } finally {
      setSyncingForm(false);
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
      const data = await apiFetch<{ floorByRarity: Record<string, number | null>; listedCount: number }>(
        `/api/market/price?slug=${encodeURIComponent(slug)}`
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

            {squad.length === 0 ? (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <p className="font-display text-xl uppercase mb-1">Aucune donnée</p>
                  <p className="text-sm text-muted">
                    Importe l&apos;export CSV de ta galerie SorareScore pour démarrer.
                  </p>
                </div>
                <CsvImport onDone={refreshAll} />
              </div>
            ) : (
              <>
                <GallerySummary cards={squad} />

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
            ) : squad.length === 0 ? (
              <div className="space-y-4">
                <div className="text-center py-6">
                  <p className="font-display text-xl uppercase mb-1">Aucune carte</p>
                  <p className="text-sm text-muted">
                    Importe l&apos;export CSV de ta galerie SorareScore pour démarrer.
                  </p>
                </div>
                <CsvImport onDone={refreshAll} />
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
                />
                <p className="font-mono text-xs text-muted mb-2">
                  {visible.length} carte{visible.length > 1 ? "s" : ""}
                </p>
                <ul className="flex flex-col gap-2">
                  {visible.map((c) => (
                    <PlayerCard
                      key={c.cardSlug}
                      card={c}
                      onSelect={setSelected}
                      coveredLeagues={coveredLeagues}
                      alerts={alertsBySlug[c.playerSlug]}
                    />
                  ))}
                </ul>
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
                        <div className="mt-2 font-mono text-xs text-muted flex flex-wrap gap-x-4 gap-y-1">
                          {Object.entries(price.floorByRarity)
                            .filter(([, v]) => v != null)
                            .map(([r, v]) => (
                              <span key={r}>
                                {r}: {v} €
                              </span>
                            ))}
                          {price.listedCount === 0 && <span>Aucune carte en vente actuellement</span>}
                        </div>
                      )}
                      {price === "error" && <p className="mt-2 text-xs text-warn">Erreur de lecture du marché</p>}
                    </li>
                  );
                })}
                </ul>
              </>
            )}

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
                      <div className="mt-2 font-mono text-xs text-muted flex flex-wrap gap-x-4 gap-y-1">
                        {Object.entries(price.floorByRarity)
                          .filter(([, v]) => v != null)
                          .map(([r, v]) => (
                            <span key={r}>
                              {r}: {v} €
                            </span>
                          ))}
                        {price.listedCount === 0 && <span>Aucune carte en vente</span>}
                      </div>
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

            <button
              onClick={refreshStats}
              disabled={syncing}
              className="w-full border border-line font-bold py-3 rounded-md text-sm disabled:opacity-50"
            >
              {syncing ? "Mise à jour…" : "Rafraîchir photos et stats"}
            </button>
            <p className="font-mono text-xs text-muted">
              Récupère photos, clubs, blessures et scores récents depuis l&apos;API publique Sorare. Aucune
              connexion requise.
            </p>

            <button
              onClick={syncForm}
              disabled={syncingForm}
              className="w-full border border-line font-bold py-3 rounded-md text-sm disabled:opacity-50"
            >
              {syncingForm ? "Synchronisation…" : "Synchroniser les compositions"}
            </button>
            <p className="font-mono text-xs text-muted">
              Récupère la composition de chaque match passé — c&apos;est ce qui permet de distinguer un
              titulaire d&apos;un remplaçant. Sans ça, la probabilité affichée est un taux de participation
              (« joue »), pas une titularisation. Aucune connexion requise, mais compte ~1 requête par joueur
              sur les 20/min publiques : c&apos;est long sur une grosse galerie, et reprenable à tout moment.
            </p>

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
              Minutes, buts et passes de tes joueurs en amicaux de club — l&apos;API Sorare ne les couvre pas,
              ceux-ci viennent d&apos;API-Football (nécessite APIFOOTBALL_KEY, ~1 requête par club puis 1 par
              match sur les 100/jour gratuites). À lancer une fois par semaine pendant la préparation.
            </p>

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
