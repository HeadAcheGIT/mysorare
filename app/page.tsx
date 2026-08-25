"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, ApiFetchError } from "@/lib/apiFetch";
import type { SquadCard, SquadResponse } from "@/lib/types";
import type { PriceComposition } from "@/lib/accountingRoi";
import type { PlayerAlert } from "./components/AlertBadges";
import { buildMercatoLists } from "@/lib/mercatoBoard";
import type { MercatoSignalRow } from "@/lib/services/mercato";
import {
  WeekIcon,
  GalleryIcon,
  LineupIcon,
  MarketIcon,
  MercatoIcon,
  HistoryIcon,
  DataIcon,
  SearchIcon,
  MoreIcon,
} from "./components/NavIcons";
import GlobalSearch from "./components/GlobalSearch";
import PlayerCompare from "./components/PlayerCompare";
import PlayerSheet from "./components/PlayerSheet";
import PlayerPopup from "./components/PlayerPopup";
import type { GameWeek } from "./components/Deadline";
import type { InsightGroup } from "./components/InsightList";
import type { TokenStatus } from "./components/SorareLogin";

// Modular tab views
import WeekTab from "./components/tabs/WeekTab";
import MercatoTab from "./components/tabs/MercatoTab";
import GalleryTab from "./components/tabs/GalleryTab";
import LineupTab, { type SavedLineup } from "./components/tabs/LineupTab";
import MarketTab, { type WatchlistGroupRow } from "./components/tabs/MarketTab";
import HistoryTab, { type SaleRow } from "./components/tabs/HistoryTab";
import SettingsTab, { type SyncLogRow } from "./components/tabs/SettingsTab";

const msg = (e: unknown) => (e instanceof ApiFetchError || e instanceof Error ? e.message : "Erreur inattendue");

export default function Page() {
  const [tab, setTab] = useState<"week" | "mercato" | "gallery" | "lineup" | "market" | "history" | "settings">(
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
  const [squadLoadFailed, setSquadLoadFailed] = useState(false);

  // Modals and trays
  const [selected, setSelected] = useState<SquadCard | null>(null);
  const [popupSlug, setPopupSlug] = useState<string | null>(null);
  const [popupExtra, setPopupExtra] = useState<ReactNode>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [compareSlugs, setCompareSlugs] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Data states
  const [coveredLeagues, setCoveredLeagues] = useState<Set<string>>(new Set());
  const [alertsBySlug, setAlertsBySlug] = useState<Record<string, PlayerAlert[]>>({});
  const [mercatoSignals, setMercatoSignals] = useState<Record<string, MercatoSignalRow>>({});
  const [savedLineups, setSavedLineups] = useState<SavedLineup[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [compositions, setCompositions] = useState<Record<string, PriceComposition>>({});
  const [salesSyncing, setSalesSyncing] = useState(false);
  const [watchlistGroups, setWatchlistGroups] = useState<WatchlistGroupRow[]>([]);
  const [activeWatchlistGroup, setActiveWatchlistGroup] = useState<number | null>(null);
  const [logs, setLogs] = useState<SyncLogRow[]>([]);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [checkingLineups, setCheckingLineups] = useState(false);
  const [syncingFriendlies, setSyncingFriendlies] = useState(false);
  const [notice, setNotice] = useState("");

  const toggleCompare = useCallback((slug: string) => {
    setCompareSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : prev.length >= 4 ? prev : [...prev, slug]
    );
  }, []);

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

  // "/" opens global search from anywhere
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || searchOpen) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      setSearchOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  // Escape closes the header's "more" menu
  useEffect(() => {
    if (!moreOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

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

  const loadCoveredLeagues = useCallback(async () => {
    try {
      const data = await apiFetch<{ leagues: { slug: string }[] }>("/api/scouting");
      setCoveredLeagues(new Set(data.leagues.map((l) => l.slug)));
    } catch {
      // Non-blocking
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      setAlertsBySlug(await apiFetch<Record<string, PlayerAlert[]>>("/api/alerts"));
    } catch {
      // Non-blocking
    }
  }, []);

  const loadMercato = useCallback(async () => {
    try {
      setMercatoSignals(await apiFetch<Record<string, MercatoSignalRow>>("/api/mercato"));
    } catch {
      // Non-blocking
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
      // Non-blocking
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

  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    try {
      const rows = await apiFetch<SaleRow[]>("/api/sales");
      setSales(rows);

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

  const refreshAll = useCallback(async () => {
    await Promise.all([loadSquad(), loadGameWeek(), loadInsights(), loadAlerts(), loadMercato()]);
  }, [loadSquad, loadGameWeek, loadInsights, loadAlerts, loadMercato]);

  useEffect(() => {
    refreshAll();
    loadCoveredLeagues();
  }, [refreshAll, loadCoveredLeagues]);

  const mercatoLists = useMemo(
    () => buildMercatoLists(squad, alertsBySlug, coveredLeagues, mercatoSignals),
    [squad, alertsBySlug, coveredLeagues, mercatoSignals]
  );

  const mercatoCount = useMemo(() => {
    const slugs = new Set([...mercatoLists.risks, ...mercatoLists.opportunities].map((i) => i.card.playerSlug));
    return slugs.size;
  }, [mercatoLists]);

  const mercatoRiskBySlug = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of mercatoLists.risks) {
      map[item.card.playerSlug] = item.reasons.map((r) => r.label).join(" · ");
    }
    return map;
  }, [mercatoLists]);

  useEffect(() => {
    if (tab === "settings") {
      loadLogs();
      loadTokenStatus();
    }
    if (tab === "market") loadWatchlist();
    if (tab === "lineup" && fixture) loadSavedLineups(fixture);
    if (tab === "history") loadSales();
  }, [tab, fixture, loadLogs, loadTokenStatus, loadWatchlist, loadSavedLineups, loadSales]);

  async function deleteSavedLineup(id: number) {
    if (!window.confirm("Supprimer cette composition ?")) return;
    try {
      await apiFetch(`/api/lineups?id=${id}`, { method: "DELETE" });
      if (fixture) await loadSavedLineups(fixture);
    } catch (err) {
      setError(msg(err));
    }
  }

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

  async function runLineupCheck() {
    setCheckingLineups(true);
    setNotice("");
    try {
      const res = await apiFetch<{
        clubsChecked: number;
        lineupsFound: number;
        playersUpdated: number;
        details: { club: string; match: string; starters: number; status: string }[];
      }>("/api/lineup-check", { method: "POST" });

      await refreshAll();
      setNotice(
        res.clubsChecked === 0
          ? "Aucun match trouvé pour tes clubs aujourd'hui."
          : `${res.clubsChecked} club(s) vérifié(s) : ${res.lineupsFound} compo(s) officielle(s) trouvée(s), ${res.playersUpdated} joueur(s) mis à jour.`
      );
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
        friendliesFound: number;
        appearancesRecorded: number;
        details: { club: string; fixtureId: number; date: string; opponent: string; minutes: number }[];
      }>("/api/friendlies", { method: "POST" });

      setNotice(
        res.clubsChecked === 0
          ? "Aucun club à synchroniser (galerie vide ou clés manquantes)."
          : `${res.clubsChecked} club(s) vérifié(s) : ${res.friendliesFound} amical/aux trouvé(s), ${res.appearancesRecorded} feuille(s) de match enregistrée(s).`
      );
    } catch (err) {
      setError(msg(err));
    } finally {
      setSyncingFriendlies(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col safe-top">
      <header className="sticky top-0 z-20 bg-ink2/95 backdrop-blur border-b border-line px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <span className="w-2 h-8 rounded-sm bg-gradient-to-b from-flood to-transparent shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display uppercase text-2xl leading-none tracking-wide">Cockpit</h1>
            <p className="font-mono text-xs text-muted truncate">
              {squad.length
                ? `${squad.length} cartes${fixture ? ` · game week ${fixture}` : ""}`
                : "Galerie vide — importe ton CSV"}
            </p>
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Rechercher un joueur"
            className="shrink-0 w-9 h-9 grid place-items-center rounded-md border border-line text-muted"
          >
            <SearchIcon />
          </button>
          <div className="relative shrink-0">
            <button
              onClick={() => setMoreOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-label="Plus — Historique et Données"
              className={`w-9 h-9 grid place-items-center rounded-md border ${
                tab === "history" || tab === "settings" ? "border-flood text-flood" : "border-line text-muted"
              }`}
            >
              <MoreIcon />
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMoreOpen(false)} aria-hidden />
                <div
                  role="menu"
                  className="absolute right-0 top-11 z-30 w-48 bg-ink2 border border-line rounded-md shadow-lg overflow-hidden"
                >
                  <button
                    role="menuitem"
                    onClick={() => {
                      setTab("history");
                      setMoreOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 ${
                      tab === "history" ? "text-flood" : "text-fg"
                    }`}
                  >
                    <HistoryIcon /> Historique
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setTab("settings");
                      setMoreOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 border-t border-line ${
                      tab === "settings" ? "text-flood" : "text-fg"
                    }`}
                  >
                    <DataIcon /> Données
                  </button>
                </div>
              </>
            )}
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
          <WeekTab
            gameWeek={gameWeek}
            unenriched={unenriched}
            squad={squad}
            squadLoadFailed={squadLoadFailed}
            insights={insights}
            insightsLoading={insightsLoading}
            refreshAll={refreshAll}
            openPlayer={openPlayer}
            loadSales={loadSales}
          />
        )}

        {tab === "mercato" && (
          <MercatoTab
            squad={squad}
            alertsBySlug={alertsBySlug}
            coveredLeagues={coveredLeagues}
            signals={mercatoSignals}
            onSelectPlayer={openPlayer}
          />
        )}

        {tab === "gallery" && (
          <GalleryTab
            loading={loading}
            squad={squad}
            squadLoadFailed={squadLoadFailed}
            fixture={fixture}
            tokenSignedIn={Boolean(tokenStatus?.signedIn)}
            coveredLeagues={coveredLeagues}
            alertsBySlug={alertsBySlug}
            mercatoRiskBySlug={mercatoRiskBySlug}
            onSelectCard={setSelected}
            refreshAll={refreshAll}
            loadSales={loadSales}
          />
        )}

        {tab === "lineup" && (
          <LineupTab
            currentFixture={gameWeek?.fixture ?? null}
            fixture={fixture}
            savedLineups={savedLineups}
            onSelectPlayer={openPlayer}
            deleteSavedLineup={deleteSavedLineup}
            onError={setError}
          />
        )}

        {tab === "market" && (
          <MarketTab
            fixture={fixture}
            alertsBySlug={alertsBySlug}
            watchlistGroups={watchlistGroups}
            activeWatchlistGroup={activeWatchlistGroup}
            setActiveWatchlistGroup={setActiveWatchlistGroup}
            loadWatchlist={loadWatchlist}
            onSelectPlayer={openPlayer}
            onError={setError}
          />
        )}

        {tab === "history" && (
          <HistoryTab
            sales={sales}
            salesLoading={salesLoading}
            compositions={compositions}
            salesSyncing={salesSyncing}
            syncSalesFromSorare={syncSalesFromSorare}
            onSelectPlayer={openPlayer}
            onError={setError}
          />
        )}

        {tab === "settings" && (
          <SettingsTab
            fixture={fixture}
            tokenStatus={tokenStatus}
            logs={logs}
            notice={notice}
            checkingLineups={checkingLineups}
            syncingFriendlies={syncingFriendlies}
            refreshAll={refreshAll}
            loadSales={loadSales}
            loadLogs={loadLogs}
            loadTokenStatus={loadTokenStatus}
            runLineupCheck={runLineupCheck}
            syncFriendlies={syncFriendlies}
            setNotice={setNotice}
            onError={setError}
          />
        )}
      </main>

      {searchOpen && (
        <GlobalSearch
          squad={squad}
          onSelectPlayer={openPlayer}
          onOpenGallery={() => {
            setTab("gallery");
            setSearchOpen(false);
          }}
          compareSlugs={compareSlugs}
          onToggleCompare={toggleCompare}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {compareOpen && (
        <PlayerCompare
          slugs={compareSlugs}
          squad={squad}
          onSelectPlayer={openPlayer}
          onRemove={toggleCompare}
          onClose={() => setCompareOpen(false)}
        />
      )}
      {!searchOpen && !compareOpen && compareSlugs.length >= 2 && (
        <button
          onClick={() => setCompareOpen(true)}
          className="fixed bottom-[72px] right-4 z-40 bg-flood text-ink font-display uppercase text-xs font-bold px-4 py-2 rounded-full shadow-lg safe-bottom"
        >
          Comparer ({compareSlugs.length})
        </button>
      )}
      {selected && (
        <PlayerSheet
          card={selected}
          onClose={() => setSelected(null)}
          compared={compareSlugs.includes(selected.playerSlug)}
          onToggleCompare={() => toggleCompare(selected.playerSlug)}
        />
      )}
      {popupSlug && (
        <PlayerPopup
          slug={popupSlug}
          extra={popupExtra}
          compared={compareSlugs.includes(popupSlug)}
          onToggleCompare={() => toggleCompare(popupSlug)}
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
              ["mercato", "Mercato", MercatoIcon],
              ["gallery", "Galerie", GalleryIcon],
              ["lineup", "Compo", LineupIcon],
              ["market", "Marché", MarketIcon],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={`relative flex-1 min-h-[48px] py-2 flex flex-col items-center justify-center gap-0.5 text-[11px] font-display uppercase tracking-wide border-t-2 ${
                tab === key ? "text-flood border-flood" : "text-muted border-transparent"
              }`}
            >
              <span className="relative">
                <Icon />
                {key === "mercato" && mercatoCount > 0 && (
                  <span
                    className="absolute -top-1 -right-2.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-warn text-ink text-[9px] font-bold font-mono flex items-center justify-center leading-none"
                    aria-label={`${mercatoCount} joueur${mercatoCount > 1 ? "s" : ""} à surveiller`}
                  >
                    {mercatoCount > 9 ? "9+" : mercatoCount}
                  </span>
                )}
              </span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
