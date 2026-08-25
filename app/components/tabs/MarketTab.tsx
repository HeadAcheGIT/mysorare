"use client";

import { useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/apiFetch";
import {
  POSITION_SHORT,
  PRIMARY_RARITY,
  compareNullable,
  u23SortValue,
} from "@/lib/types";
import AlertBadges, { type PlayerAlert } from "../AlertBadges";
import PlayerBadges from "../PlayerBadges";
import SortControl from "../SortControl";
import Scouting from "../Scouting";
import BuyAdvice from "../BuyAdvice";
import AuctionWatch from "../AuctionWatch";
import type { SortDirection } from "../GalleryFilters";

export type PriceCheck = {
  floorByRarity: Record<string, number | null>;
  floorInSeasonByRarity?: Record<string, number | null>;
  valuation?: { value: number | null; sampleSize: number; launchPremium: boolean; thin: boolean } | null;
  listedCount: number;
};

export function priceHeadline(p: PriceCheck): number | null {
  if (p.valuation?.value != null) return p.valuation.value;
  const inSeason = Object.values(p.floorInSeasonByRarity ?? {}).filter((v): v is number => v != null);
  if (inSeason.length) return Math.min(...inSeason);
  const any = Object.values(p.floorByRarity).filter((v): v is number => v != null);
  return any.length ? Math.min(...any) : null;
}

export function PriceBreakdown({ price }: { price: PriceCheck }) {
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

export type WatchlistItemRow = {
  playerSlug: string;
  label: string;
  position: string | null;
  club: string | null;
  birthDate: string | null;
  competitionName: string | null;
};

export type WatchlistGroupRow = {
  id: number;
  name: string;
  items: WatchlistItemRow[];
};

interface MarketTabProps {
  fixture: string | null;
  alertsBySlug: Record<string, PlayerAlert[]>;
  watchlistGroups: WatchlistGroupRow[];
  activeWatchlistGroup: number | null;
  setActiveWatchlistGroup: (id: number | null) => void;
  loadWatchlist: () => Promise<void>;
  onSelectPlayer: (playerSlug: string, extra?: ReactNode) => void;
  onError: (msg: string) => void;
}

export default function MarketTab({
  fixture,
  alertsBySlug,
  watchlistGroups,
  activeWatchlistGroup,
  setActiveWatchlistGroup,
  loadWatchlist,
  onSelectPlayer,
  onError,
}: MarketTabProps) {
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

  const [prices, setPrices] = useState<Record<string, PriceCheck | "loading" | "error">>({});
  const [newGroupName, setNewGroupName] = useState("");
  const [importingWatchlists, setImportingWatchlists] = useState(false);
  const [marketNotice, setMarketNotice] = useState("");

  const watchlist = watchlistGroups.find((g) => g.id === activeWatchlistGroup)?.items ?? [];

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
        return compareNullable(watchlistPriceFloor(a.playerSlug), watchlistPriceFloor(a.playerSlug), watchlistDirection);
      }
      const cmp = a.label.localeCompare(b.label, "fr");
      return watchlistDirection === "asc" ? cmp : -cmp;
    });
  }, [watchlist, watchlistSort, watchlistDirection, prices]);

  async function checkPrice(slug: string) {
    setPrices((p) => ({ ...p, [slug]: "loading" }));
    try {
      const data = await apiFetch<PriceCheck>(
        `/api/market/price?slug=${encodeURIComponent(slug)}&rarity=${PRIMARY_RARITY}`
      );
      setPrices((p) => ({ ...p, [slug]: data }));
    } catch (err) {
      setPrices((p) => ({ ...p, [slug]: "error" }));
      onError(err instanceof Error ? err.message : "Erreur de lecture du marché");
    }
  }

  async function runMarketSearch() {
    if (marketQuery.trim().length < 2) return;
    setMarketLoading(true);
    try {
      setMarketResults(await apiFetch(`/api/market/search?q=${encodeURIComponent(marketQuery.trim())}`));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erreur recherche");
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
      onError(err instanceof Error ? err.message : "Erreur ajout watchlist");
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
      onError(err instanceof Error ? err.message : "Erreur création liste");
    }
  }

  async function importWatchlists() {
    setImportingWatchlists(true);
    setMarketNotice("");
    try {
      const res = await apiFetch<{
        lists: number;
        groupsCreated: number;
        added: number;
        updated: number;
        details: { name: string; added: number; updated: number }[];
      }>("/api/watchlist/import", { method: "POST" });

      await loadWatchlist();
      setMarketNotice(
        res.lists === 0
          ? "Aucune watchlist trouvée sur ton compte Sorare."
          : `${res.lists} liste(s) Sorare : ${res.added} joueur(s) ajouté(s), ${res.updated} mis à jour` +
              (res.groupsCreated > 0 ? `, ${res.groupsCreated} liste(s) créée(s) ici.` : ".")
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erreur import watchlists");
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
      onError(err instanceof Error ? err.message : "Erreur suppression liste");
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
      onError(err instanceof Error ? err.message : "Erreur retrait joueur");
    }
  }

  return (
    <section aria-label="Marché" className="space-y-6">
      <div>
        <h2 className="font-display uppercase text-sm tracking-wide text-muted mb-2">
          Scouting par championnat
        </h2>
        <p className="font-mono text-xs text-muted mb-2">
          Repérer une cible avant d&apos;acheter — classé par championnat réellement couvert par l&apos;API.
        </p>
        <Scouting onError={onError} onSelectPlayer={onSelectPlayer} />
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
                        onClick={() => onSelectPlayer(p.slug)}
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
        <BuyAdvice fixture={fixture} onSelectPlayer={onSelectPlayer} />
        <AuctionWatch onSelectPlayer={onSelectPlayer} onError={onError} />
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

      {marketNotice && <p className="font-mono text-xs text-ok mb-3">{marketNotice}</p>}

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
                  onClick={() => onSelectPlayer(w.playerSlug)}
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
  );
}
