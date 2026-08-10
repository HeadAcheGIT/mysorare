"use client";

import { useCallback, useEffect, useState } from "react";

const POS: Record<string, string> = { Goalkeeper: "GK", Defender: "DEF", Midfielder: "MIL", Forward: "ATT" };

type SquadCard = {
  cardSlug: string;
  playerSlug: string;
  name: string;
  position: string;
  rarity: string;
  club: string | null;
  inSeason: boolean;
  bonus: number;
  injury: string | null;
  pStart: number | null;
  confidence: number | null;
  expected: number | null;
  l5: number | null;
  l15: number | null;
  excluded: boolean;
};

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

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const num = (v: number | null) => (v == null ? "—" : v.toFixed(1));

// Tailwind needs statically-referenceable class names — a template literal
// like `text-${rarity}` would be purged from the production build.
const RARITY_CLASS: Record<string, string> = {
  common: "text-common border-common",
  limited: "text-limited border-limited",
  rare: "text-rare border-rare",
  super_rare: "text-superrare border-superrare",
  unique: "text-white border-white",
};

export default function Page() {
  const [tab, setTab] = useState<"lineup" | "squad" | "market" | "sync">("lineup");
  const [fixture, setFixture] = useState<string | null>(null);
  const [squad, setSquad] = useState<SquadCard[]>([]);
  const [competitions, setCompetitions] = useState<{ name: string }[]>([]);
  const [competition, setCompetition] = useState("");
  const [lineup, setLineup] = useState<OptimiseResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [search, setSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [logs, setLogs] = useState<{ job: string; status: string; detail: string | null; ranAt: string }[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [checkingLineups, setCheckingLineups] = useState(false);
  const [lineupCheckResult, setLineupCheckResult] = useState("");

  // Market tab
  const [marketQuery, setMarketQuery] = useState("");
  const [marketResults, setMarketResults] = useState<{ slug: string; name: string; position: string; club: string | null }[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [watchlist, setWatchlist] = useState<
    { playerSlug: string; label: string; position: string | null; club: string | null }[]
  >([]);
  const [prices, setPrices] = useState<Record<string, { floorByRarity: Record<string, number | null>; listedCount: number } | "loading" | "error">>({});

  const loadSquad = useCallback(async () => {
    const r = await fetch("/api/squad");
    const data = await r.json();
    setFixture(data.fixture);
    setSquad(data.cards);
  }, []);

  const loadCompetitions = useCallback(async () => {
    const r = await fetch("/api/competitions");
    const data = await r.json();
    setCompetitions(data);
    if (data.length && !competition) setCompetition(data[0].name);
  }, [competition]);

  const loadLogs = useCallback(async () => {
    const r = await fetch("/api/sync-log");
    setLogs(await r.json());
  }, []);

  useEffect(() => {
    loadCompetitions();
    loadSquad();
  }, [loadCompetitions, loadSquad]);

  useEffect(() => {
    if (tab === "sync") loadLogs();
    if (tab === "market") loadWatchlist();
  }, [tab, loadLogs]);

  async function loadWatchlist() {
    const r = await fetch("/api/watchlist");
    setWatchlist(await r.json());
  }

  async function checkPrice(slug: string) {
    setPrices((p) => ({ ...p, [slug]: "loading" }));
    try {
      const r = await fetch(`/api/market/price?slug=${encodeURIComponent(slug)}`);
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setPrices((p) => ({ ...p, [slug]: data }));
    } catch {
      setPrices((p) => ({ ...p, [slug]: "error" }));
    }
  }

  async function checkAllWatched() {
    for (const w of watchlist) await checkPrice(w.playerSlug);
  }

  async function runMarketSearch() {
    if (marketQuery.trim().length < 2) return;
    setMarketLoading(true);
    try {
      const r = await fetch(`/api/market/search?q=${encodeURIComponent(marketQuery.trim())}`);
      setMarketResults(await r.json());
    } finally {
      setMarketLoading(false);
    }
  }

  async function addToWatchlist(p: { slug: string; name: string; position: string; club: string | null }) {
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerSlug: p.slug, label: p.name, position: p.position, club: p.club }),
    });
    await loadWatchlist();
  }

  async function removeFromWatchlist(slug: string) {
    await fetch(`/api/watchlist?playerSlug=${encodeURIComponent(slug)}`, { method: "DELETE" });
    await loadWatchlist();
  }

  async function runOptimise() {
    if (!competition) return;
    setBuilding(true);
    try {
      const r = await fetch("/api/optimise", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competition }),
      });
      setLineup(await r.json());
    } finally {
      setBuilding(false);
    }
  }

  async function runFullSync() {
    setSyncing(true);
    setProgress(null);
    try {
      const squadRes = await fetch("/api/sync", { method: "POST" }).then((r) => r.json());
      let cursor = 0;
      let total = squadRes.cards ?? 0;
      for (;;) {
        const batch = await fetch("/api/sync/batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cursor }),
        }).then((r) => r.json());
        total = batch.total ?? total;
        cursor = (cursor || 0) + (batch.processed ?? 0);
        setProgress({ done: cursor, total });
        if (batch.nextCursor === null || batch.status === "error") break;
        cursor = batch.nextCursor;
      }
      if (squadRes.fixture) {
        await fetch("/api/recompute", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fixture: squadRes.fixture }),
        });
      }
      await loadSquad();
      await loadLogs();
    } finally {
      setSyncing(false);
    }
  }

  async function runLineupCheck() {
    setCheckingLineups(true);
    setLineupCheckResult("");
    try {
      let cursor = 0;
      let totalFound = 0;
      for (;;) {
        const batch = await fetch("/api/lineup-check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cursor }),
        }).then((r) => r.json());
        if (batch.status === "error") {
          setLineupCheckResult(`Erreur : ${batch.detail}`);
          break;
        }
        totalFound += batch.found ?? 0;
        if (batch.nextCursor === null) {
          setLineupCheckResult(`${totalFound} compo(s) confirmée(s) trouvée(s).`);
          break;
        }
        cursor = batch.nextCursor;
      }
      await loadSquad();
    } finally {
      setCheckingLineups(false);
    }
  }

  const filteredSquad = squad
    .filter((c) => !rarityFilter || c.rarity === rarityFilter)
    .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.club ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen flex flex-col safe-top">
      <header className="sticky top-0 z-10 bg-ink2 border-b border-line px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-2 h-8 rounded-sm bg-gradient-to-b from-flood to-transparent shrink-0" />
          <div className="min-w-0">
            <h1 className="font-display uppercase text-2xl leading-none tracking-wide">Cockpit</h1>
            <p className="font-mono text-xs text-muted truncate">
              {fixture ? `Game week ${fixture} · ${squad.length} cartes` : "Aucune donnée — lance une synchro"}
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-24 max-w-lg w-full mx-auto">
        {tab === "lineup" && (
          <section>
            <div className="flex gap-2 mb-4">
              <select
                value={competition}
                onChange={(e) => setCompetition(e.target.value)}
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
                <p className="font-mono text-xs text-muted mb-3">
                  <span className="font-display text-2xl text-flood align-middle">{lineup.projectedTotal}</span>
                  {" "}pts projetés · {lineup.competition} · game week {lineup.fixture}
                </p>
                <ol className="flex flex-col gap-2">
                  {lineup.cards.map((c) => (
                    <li
                      key={c.cardSlug}
                      className={`grid grid-cols-[40px_1fr_auto] gap-3 items-center p-3 rounded-lg bg-ink2 border border-line border-l-[3px] ${
                        c.isCaptain ? "border-l-flood" : "border-l-limited"
                      }`}
                    >
                      <span className="font-display text-xs font-bold uppercase text-muted tracking-wider">
                        {POS[c.position] ?? c.position}
                      </span>
                      <span className="min-w-0 flex flex-col gap-1.5">
                        <span className="font-bold truncate">
                          {c.name}
                          {c.isCaptain && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-flood text-ink text-[10px] font-bold">C</span>
                          )}
                        </span>
                        <span className="text-xs text-muted truncate">
                          {c.club ?? "sans club"} · titulaire {pct(c.pStart)} · L15 {num(c.l15)}
                        </span>
                        <span className="bar-track max-w-[180px]">
                          <span className={`bar-fill ${c.pStart < 0.5 ? "low" : ""}`} style={{ width: `${c.pStart * 100}%` }} />
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

            {!lineup && <p className="font-mono text-sm text-muted">Choisis une compétition et lance « Composer ».</p>}
          </section>
        )}

        {tab === "squad" && (
          <section>
            <div className="flex gap-2 mb-4">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrer par joueur ou club"
                className="flex-1 bg-ink border border-line rounded-md px-3 py-2 text-sm"
              />
              <select
                value={rarityFilter}
                onChange={(e) => setRarityFilter(e.target.value)}
                className="bg-ink border border-line rounded-md px-2 py-2 text-sm"
              >
                <option value="">Toutes</option>
                <option value="common">Common</option>
                <option value="limited">Limited</option>
                <option value="rare">Rare</option>
                <option value="super_rare">Super Rare</option>
                <option value="unique">Unique</option>
              </select>
            </div>
            <ul className="flex flex-col gap-2">
              {filteredSquad.map((c) => (
                <li key={c.cardSlug} className="p-3 rounded-lg bg-ink2 border border-line">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="font-bold truncate">{c.name}</p>
                      <p className="text-xs text-muted truncate">
                        {POS[c.position] ?? c.position} · {c.club ?? "—"}
                        {c.inSeason ? " · in-season" : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${
                        c.injury ? "text-warn border-warn" : RARITY_CLASS[c.rarity] ?? "text-muted border-muted"
                      }`}
                    >
                      {c.injury ?? c.rarity}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-2 font-mono text-xs text-muted">
                    <span>Titulaire {pct(c.pStart)}</span>
                    {c.confidence != null && (
                      <span className={c.confidence < 0.4 ? "text-warn" : ""}>
                        Confiance {Math.round(c.confidence * 100)}%
                      </span>
                    )}
                    <span>Proj. {num(c.expected)}</span>
                    <span>L5 {num(c.l5)}</span>
                    <span>L15 {num(c.l15)}</span>
                  </div>
                </li>
              ))}
              {filteredSquad.length === 0 && <p className="font-mono text-sm text-muted">Aucune carte.</p>}
            </ul>
          </section>
        )}

        {tab === "market" && (
          <section>
            <div className="flex gap-2 mb-4">
              <input
                value={marketQuery}
                onChange={(e) => setMarketQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runMarketSearch()}
                placeholder="Chercher un joueur…"
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
                {marketResults.map((p) => {
                  const already = watchlist.some((w) => w.playerSlug === p.slug);
                  return (
                    <li key={p.slug} className="p-3 rounded-lg bg-ink2 border border-line flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold truncate">{p.name}</p>
                        <p className="text-xs text-muted truncate">
                          {POS[p.position] ?? p.position} · {p.club ?? "—"}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => checkPrice(p.slug)}
                          className="text-xs border border-line rounded-md px-2 py-1.5"
                        >
                          Prix
                        </button>
                        {!already && (
                          <button
                            onClick={() => addToWatchlist(p)}
                            className="text-xs bg-flood text-ink font-bold rounded-md px-2 py-1.5"
                          >
                            + Suivre
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {marketResults.some((p) => prices[p.slug] && prices[p.slug] !== "loading" && prices[p.slug] !== "error") &&
              marketResults.map((p) => {
                const price = prices[p.slug];
                if (!price || price === "loading" || price === "error") return null;
                return (
                  <div key={`price-${p.slug}`} className="mb-4 p-3 rounded-lg bg-ink2 border border-line font-mono text-xs">
                    <p className="font-bold font-body mb-1">{price ? p.name : ""}</p>
                    {Object.entries(price.floorByRarity).map(([r, v]) => (
                      <p key={r} className="flex justify-between text-muted">
                        <span>{r}</span>
                        <span>{v != null ? `${v} €` : "aucune annonce"}</span>
                      </p>
                    ))}
                  </div>
                );
              })}

            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display uppercase text-sm tracking-wide text-muted">Ma watchlist</h2>
              {watchlist.length > 0 && (
                <button onClick={checkAllWatched} className="text-xs border border-line rounded-md px-2 py-1">
                  Tout vérifier
                </button>
              )}
            </div>
            <ul className="flex flex-col gap-2">
              {watchlist.map((w) => {
                const price = prices[w.playerSlug];
                return (
                  <li key={w.playerSlug} className="p-3 rounded-lg bg-ink2 border border-line">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold truncate">{w.label}</p>
                        <p className="text-xs text-muted truncate">
                          {w.position ? POS[w.position] ?? w.position : ""} {w.club ? `· ${w.club}` : ""}
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
                        {price.listedCount === 0 && <span>Aucune carte en vente actuellement</span>}
                      </div>
                    )}
                    {price === "error" && <p className="mt-2 text-xs text-warn">Erreur de lecture du marché</p>}
                  </li>
                );
              })}
              {watchlist.length === 0 && (
                <p className="font-mono text-sm text-muted">
                  Cherche un joueur ci-dessus et tape « + Suivre » pour l'ajouter ici.
                </p>
              )}
            </ul>
          </section>
        )}

        {tab === "sync" && (
          <section>
            <button
              onClick={runFullSync}
              disabled={syncing}
              className="w-full bg-flood text-ink font-bold py-3 rounded-md text-sm disabled:opacity-50 mb-2"
            >
              {syncing ? "Synchro en cours…" : "Rafraîchir toutes les données"}
            </button>
            <button
              onClick={runLineupCheck}
              disabled={checkingLineups}
              className="w-full border border-line font-bold py-3 rounded-md text-sm disabled:opacity-50 mb-2"
            >
              {checkingLineups ? "Vérification…" : "Vérifier les compos officielles"}
            </button>
            <p className="font-mono text-xs text-muted mb-4">
              Utile seulement ~90 min avant le coup d'envoi — l'API ne donne la compo officielle qu'à ce moment-là,
              pas avant. {lineupCheckResult}
            </p>
            {progress && (
              <div className="mb-4">
                <div className="bar-track">
                  <span
                    className="bar-fill"
                    style={{ width: `${progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0}%` }}
                  />
                </div>
                <p className="font-mono text-xs text-muted mt-1">
                  {progress.done}/{progress.total} joueurs
                </p>
              </div>
            )}
            <p className="font-mono text-xs text-muted mb-4">
              La synchro automatique tourne une fois par jour. Ce bouton force un rafraîchissement complet
              maintenant — effectif, forme des joueurs, projections.
            </p>
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
            </ul>
          </section>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-ink2 border-t border-line flex safe-bottom z-10">
        {(
          [
            ["lineup", "Line-up"],
            ["squad", "Effectif"],
            ["market", "Marché"],
            ["sync", "Synchro"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 text-sm font-display uppercase tracking-wide ${
              tab === key ? "text-flood border-t-2 border-flood" : "text-muted border-t-2 border-transparent"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
