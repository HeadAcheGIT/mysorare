"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiFetchError } from "@/lib/apiFetch";
import { POSITION_SHORT, type SquadCard, type SquadResponse } from "@/lib/types";
import PlayerCard from "./components/PlayerCard";
import PlayerSheet from "./components/PlayerSheet";
import GalleryFilters, { type SortKey } from "./components/GalleryFilters";
import GallerySummary from "./components/GallerySummary";
import CsvImport from "./components/CsvImport";
import SorareLogin from "./components/SorareLogin";

type OptimiseResult = {
  fixture: string | null;
  competition: string;
  projectedTotal?: number;
  captain?: string | null;
  error?: string;
  cards: {
    cardSlug: string;
    name: string;
    position: string;
    club: string | null;
    expected: number;
    pStart: number;
    l15: number | null;
    isCaptain: boolean;
  }[];
};

type SavedLineup = {
  id: number;
  fixture: string;
  competition: string;
  cards: string[];
  captain: string | null;
  projectedTotal: number;
  createdAt: string;
};

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const one = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const msg = (e: unknown) => (e instanceof ApiFetchError || e instanceof Error ? e.message : "Erreur inattendue");

export default function Page() {
  const [tab, setTab] = useState<"gallery" | "lineup" | "market" | "settings">("gallery");
  const [fixture, setFixture] = useState<string | null>(null);
  const [squad, setSquad] = useState<SquadCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SquadCard | null>(null);

  // Gallery controls
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");
  const [rarity, setRarity] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [inSeasonOnly, setInSeasonOnly] = useState(false);

  // Line-up
  const [competitions, setCompetitions] = useState<{ name: string }[]>([]);
  const [competition, setCompetition] = useState("");
  const [lineup, setLineup] = useState<OptimiseResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [savedLineups, setSavedLineups] = useState<SavedLineup[]>([]);
  const [savingLineup, setSavingLineup] = useState(false);

  // Settings
  const [logs, setLogs] = useState<{ job: string; status: string; detail: string | null; ranAt: string }[]>([]);
  const [tokenStatus, setTokenStatus] = useState<{ signedIn: boolean; expiresAt: string | null } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [checkingLineups, setCheckingLineups] = useState(false);
  const [notice, setNotice] = useState("");

  // Market
  const [marketQuery, setMarketQuery] = useState("");
  const [marketResults, setMarketResults] = useState<
    { slug: string; name: string; position: string; club: string | null }[]
  >([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [watchlist, setWatchlist] = useState<
    { playerSlug: string; label: string; position: string | null; club: string | null }[]
  >([]);
  const [prices, setPrices] = useState<
    Record<string, { floorByRarity: Record<string, number | null>; listedCount: number } | "loading" | "error">
  >({});

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

  const loadCompetitions = useCallback(async () => {
    try {
      const data = await apiFetch<{ name: string }[]>("/api/competitions");
      setCompetitions(data);
      setCompetition((c) => c || data[0]?.name || "");
    } catch (err) {
      setError(msg(err));
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
      setWatchlist(await apiFetch("/api/watchlist"));
    } catch (err) {
      setError(msg(err));
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
    loadCompetitions();
  }, [loadSquad, loadCompetitions]);

  useEffect(() => {
    if (tab === "settings") {
      loadLogs();
      loadTokenStatus();
    }
    if (tab === "market") loadWatchlist();
    if (tab === "lineup" && fixture) loadSavedLineups(fixture);
  }, [tab, fixture, loadLogs, loadTokenStatus, loadWatchlist, loadSavedLineups]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = squad.filter((c) => {
      if (position && c.position !== position) return false;
      if (rarity && c.rarity !== rarity) return false;
      if (inSeasonOnly && !c.inSeason) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.club ?? "").toLowerCase().includes(q);
    });

    const score = (c: SquadCard) => c.expected ?? c.sorareProjection ?? c.l10 ?? -1;
    const formAvg = (c: SquadCard) =>
      c.recentScores.length ? c.recentScores.reduce((a, b) => a + b, 0) / c.recentScores.length : -1;

    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "fr");
      if (sort === "price") return (b.floorPrice ?? -1) - (a.floorPrice ?? -1);
      if (sort === "form") return formAvg(b) - formAvg(a);
      return score(b) - score(a);
    });
  }, [squad, search, position, rarity, inSeasonOnly, sort]);

  async function runOptimise() {
    if (!competition) return;
    setBuilding(true);
    try {
      setLineup(
        await apiFetch<OptimiseResult>("/api/optimise", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ competition }),
        })
      );
    } catch (err) {
      setError(msg(err));
    } finally {
      setBuilding(false);
    }
  }

  async function saveLineup() {
    if (!lineup || lineup.error || !lineup.fixture) return;
    setSavingLineup(true);
    try {
      await apiFetch("/api/lineups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fixture: lineup.fixture,
          competition: lineup.competition,
          cardSlugs: lineup.cards.map((c) => c.cardSlug),
          captain: lineup.cards.find((c) => c.isCaptain)?.cardSlug ?? null,
          projectedTotal: lineup.projectedTotal ?? 0,
        }),
      });
      await loadSavedLineups(lineup.fixture);
    } catch (err) {
      setError(msg(err));
    } finally {
      setSavingLineup(false);
    }
  }

  async function deleteSavedLineup(id: number) {
    try {
      await apiFetch(`/api/lineups?id=${id}`, { method: "DELETE" });
      setSavedLineups((l) => l.filter((x) => x.id !== id));
    } catch (err) {
      setError(msg(err));
    }
  }

  /** Refreshes photos/stats from the public API — no Sorare login involved. */
  async function refreshStats() {
    setSyncing(true);
    setNotice("");
    try {
      let cursor = 0;
      for (;;) {
        const batch = await apiFetch<{ processed: number; nextCursor: number | null; total: number }>(
          "/api/enrich",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cursor }),
          }
        );
        cursor += batch.processed;
        setNotice(`${cursor}/${batch.total} joueurs`);
        if (batch.nextCursor === null) break;
        cursor = batch.nextCursor;
      }
      await loadSquad();
      await loadLogs();
      setNotice("Stats à jour.");
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
        body: JSON.stringify({ playerSlug: p.slug, label: p.name, position: p.position, club: p.club }),
      });
      await loadWatchlist();
    } catch (err) {
      setError(msg(err));
    }
  }

  async function removeFromWatchlist(slug: string) {
    try {
      await apiFetch(`/api/watchlist?playerSlug=${encodeURIComponent(slug)}`, { method: "DELETE" });
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
                <CsvImport onDone={loadSquad} />
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
                  inSeasonOnly={inSeasonOnly}
                  onInSeasonOnly={setInSeasonOnly}
                />
                <p className="font-mono text-xs text-muted mb-2">
                  {visible.length} carte{visible.length > 1 ? "s" : ""}
                </p>
                <ul className="flex flex-col gap-2">
                  {visible.map((c) => (
                    <PlayerCard key={c.cardSlug} card={c} onSelect={setSelected} />
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
            <div className="flex gap-2 mb-4">
              <select
                value={competition}
                onChange={(e) => setCompetition(e.target.value)}
                aria-label="Compétition"
                className="flex-1 bg-ink border border-line rounded-md px-3 py-2 text-sm"
              >
                {competitions.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={runOptimise}
                disabled={building}
                className="bg-flood text-ink font-bold px-4 py-2 rounded-md text-sm disabled:opacity-50"
              >
                {building ? "…" : "Composer"}
              </button>
            </div>

            {lineup?.error && <p className="font-mono text-sm text-muted">{lineup.error}</p>}

            {lineup && !lineup.error && (
              <>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="font-mono text-xs text-muted">
                    <span className="font-display text-2xl text-flood align-middle">{lineup.projectedTotal}</span> pts
                    projetés · {lineup.competition}
                  </p>
                  <button
                    onClick={saveLineup}
                    disabled={savingLineup}
                    className="shrink-0 text-xs border border-line rounded-md px-2 py-1.5 disabled:opacity-50"
                  >
                    {savingLineup ? "…" : "Sauvegarder"}
                  </button>
                </div>
                <ol className="flex flex-col gap-2">
                  {lineup.cards.map((c) => (
                    <li
                      key={c.cardSlug}
                      className={`grid grid-cols-[40px_1fr_auto] gap-3 items-center p-3 rounded-lg bg-ink2 border border-line border-l-[3px] ${
                        c.isCaptain ? "border-l-flood" : "border-l-limited"
                      }`}
                    >
                      <span className="font-display text-xs font-bold uppercase text-muted tracking-wider">
                        {POSITION_SHORT[c.position] ?? c.position}
                      </span>
                      <span className="min-w-0 flex flex-col gap-1">
                        <span className="font-bold truncate">
                          {c.name}
                          {c.isCaptain && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-flood text-ink text-[10px] font-bold">C</span>
                          )}
                        </span>
                        <span className="text-xs text-muted truncate">
                          {c.club ?? "sans club"} · titulaire {pct(c.pStart)} · L15 {one(c.l15)}
                        </span>
                        <span className="bar-track max-w-[180px]">
                          <span
                            className={`bar-fill ${c.pStart < 0.5 ? "low" : ""}`}
                            style={{ width: `${c.pStart * 100}%` }}
                          />
                        </span>
                      </span>
                      <span className="font-display text-3xl font-bold text-right leading-none">
                        {c.expected}
                        <small className="block text-[10px] font-mono text-muted font-normal">projeté</small>
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}

            {!lineup && (
              <p className="font-mono text-sm text-muted">
                Choisis une compétition et lance « Composer ». Nécessite des projections calculées.
              </p>
            )}

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
          </section>
        )}

        {tab === "market" && (
          <section aria-label="Marché">
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
              <ul className="flex flex-col gap-2 mb-6">
                {marketResults.map((p) => (
                  <li
                    key={p.slug}
                    className="p-3 rounded-lg bg-ink2 border border-line flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-bold truncate">{p.name}</p>
                      <p className="text-xs text-muted truncate">
                        {POSITION_SHORT[p.position] ?? p.position} · {p.club ?? "—"}
                      </p>
                    </div>
                    {!watchlist.some((w) => w.playerSlug === p.slug) && (
                      <button
                        onClick={() => addToWatchlist(p)}
                        className="shrink-0 text-xs bg-flood text-ink font-bold rounded-md px-2 py-1.5"
                      >
                        + Suivre
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">Ma watchlist</h2>
            <ul className="flex flex-col gap-2">
              {watchlist.map((w) => {
                const price = prices[w.playerSlug];
                return (
                  <li key={w.playerSlug} className="p-3 rounded-lg bg-ink2 border border-line">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold truncate">{w.label}</p>
                        <p className="text-xs text-muted truncate">
                          {w.position ? POSITION_SHORT[w.position] ?? w.position : ""}
                          {w.club ? ` · ${w.club}` : ""}
                        </p>
                      </div>
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

        {tab === "settings" && (
          <section aria-label="Données" className="space-y-3">
            <CsvImport onDone={loadSquad} />

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
              onClick={runLineupCheck}
              disabled={checkingLineups}
              className="w-full border border-line font-bold py-3 rounded-md text-sm disabled:opacity-50"
            >
              {checkingLineups ? "Vérification…" : "Vérifier les compos officielles"}
            </button>
            <p className="font-mono text-xs text-muted">
              Utile seulement ~90 min avant le coup d&apos;envoi. Nécessite APIFOOTBALL_KEY.
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

      <nav className="fixed bottom-0 inset-x-0 bg-ink2 border-t border-line safe-bottom z-30">
        <div className="max-w-3xl mx-auto flex">
          {(
            [
              ["gallery", "Galerie"],
              ["lineup", "Compo"],
              ["market", "Marché"],
              ["settings", "Données"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={`flex-1 py-3 text-sm font-display uppercase tracking-wide border-t-2 ${
                tab === key ? "text-flood border-flood" : "text-muted border-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
