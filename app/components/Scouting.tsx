"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { POSITION_SHORT } from "@/lib/types";
import { formatMoney as money, relativeDate as daysAgo } from "@/lib/format";
import { scoreColor, SCORE_COLOR_CLASS } from "@/lib/types";

type Money = { amount: number; currency: string } | null;

type SaleTrend = {
  sales: { date: string; money: Money }[];
  lastSale: Money;
  lastSaleDate: string | null;
  trendPct: number | null;
};

type ScoutPlayer = {
  slug: string;
  name: string;
  position: string;
  club: string | null;
  picture: string | null;
  avgL5: number | null;
  avgL10Played: number | null;
  app15: number | null;
  injury: string | null;
  floorInSeason: Money;
  floorAnySeason: Money;
  inSeasonTrend: SaleTrend | null;
  ownedCards: number;
  ownedInSeason: number;
};

type League = { slug: string; name: string; country: string | null };

/** Leagues worth putting first for a French manager; the rest stay alphabetical. */
const PINNED = ["ligue-1-fr", "premier-league-gb-eng", "laliga-es", "serie-a-it", "bundesliga-de", "ligue-2-fr"];

/** The in-season sale history block, slotted into the shared player popup on open. */
function SaleHistory({ trend, floorInSeason, floorAnySeason, rarity }: { trend: SaleTrend | null; floorInSeason: Money; floorAnySeason: Money; rarity: string }) {
  if (!trend?.sales.length) {
    return (
      <p className="font-mono text-xs text-muted">
        Aucune vente in-season {rarity} enregistrée pour ce joueur.
        {floorAnySeason && ` Prix toutes saisons : ${money(floorAnySeason)}.`}
      </p>
    );
  }
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1.5">
        Ventes in-season récentes ({rarity})
      </p>
      <ul className="space-y-1">
        {trend.sales.slice(0, 8).map((s, i) => (
          <li key={i} className="flex justify-between font-mono text-xs text-muted">
            <span>{daysAgo(s.date)}</span>
            <span className={i === 0 ? "text-white" : ""}>{money(s.money)}</span>
          </li>
        ))}
      </ul>
      {floorInSeason && (
        <p className="font-mono text-[11px] text-muted mt-2 pt-2 border-t border-line">
          Annonce directe la moins chère en ce moment : {money(floorInSeason)}
        </p>
      )}
    </div>
  );
}

/**
 * "Should I buy this?" for one league at a time.
 *
 * Shows form and playing time next to the price, because a cheap card for
 * someone who doesn't start is not a bargain, and flags players already in
 * your gallery so the list never recommends a duplicate.
 *
 * The price itself is the last *completed sale*, not a live listing — Sorare's
 * live floor price only reflects fixed-price buy-now offers, and misses the
 * auctions most in-season cards actually move through. A quiet floor-price
 * column reads as "nothing sells here", which was wrong.
 *
 * Tapping a row opens the same player popup used everywhere else in the app
 * (bio, next fixtures, recent results), with the sale history above slotted
 * in as extra context — one consistent interaction instead of a one-off
 * expand-in-place unique to this screen.
 */
export default function Scouting({
  onError,
  onSelectPlayer,
}: {
  onError: (m: string) => void;
  onSelectPlayer: (playerSlug: string, extra?: ReactNode) => void;
}) {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [league, setLeague] = useState("ligue-1-fr");
  const [rarity, setRarity] = useState("limited");
  const [players, setPlayers] = useState<ScoutPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch<{ leagues: League[] }>("/api/scouting")
      .then((d) => {
        const pinned = PINNED.map((s) => d.leagues.find((l) => l.slug === s)).filter((l): l is League => !!l);
        const rest = d.leagues.filter((l) => !PINNED.includes(l.slug));
        setLeagues([...pinned, ...rest]);
      })
      .catch(() => {
        // Non-blocking: the default league still works without the picker.
      });
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ players: ScoutPlayer[] }>(
        `/api/scouting?league=${encodeURIComponent(league)}&rarity=${rarity}`
      );
      setPlayers(data.players);
      setLoaded(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Scouting indisponible");
    } finally {
      setLoading(false);
    }
  }, [league, rarity, onError]);

  const noSales = loaded && players.length > 0 && players.every((p) => !p.inSeasonTrend?.sales.length);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select
          value={league}
          onChange={(e) => setLeague(e.target.value)}
          aria-label="Championnat"
          className="flex-1 min-w-0 bg-ink border border-line rounded-md px-2 py-2 text-sm"
        >
          {leagues.length === 0 && <option value="ligue-1-fr">Ligue 1</option>}
          {(() => {
            const pinned = leagues.filter((l) => PINNED.includes(l.slug));
            const rest = leagues.filter((l) => !PINNED.includes(l.slug));
            // Country present = domestic league; absent = international
            // competition (continental cups, qualifiers, ...). Splitting the
            // 50+ remaining entries into these two groups at least gives the
            // select some structure instead of one flat alphabetical wall.
            const international = rest.filter((l) => !l.country);
            const domestic = rest.filter((l) => l.country);
            return (
              <>
                {pinned.length > 0 && (
                  <optgroup label="Épinglés">
                    {pinned.map((l) => (
                      <option key={l.slug} value={l.slug}>{l.name}</option>
                    ))}
                  </optgroup>
                )}
                {domestic.length > 0 && (
                  <optgroup label="Championnats domestiques">
                    {domestic.map((l) => (
                      <option key={l.slug} value={l.slug}>{l.name}</option>
                    ))}
                  </optgroup>
                )}
                {international.length > 0 && (
                  <optgroup label="Compétitions internationales">
                    {international.map((l) => (
                      <option key={l.slug} value={l.slug}>{l.name}</option>
                    ))}
                  </optgroup>
                )}
              </>
            );
          })()}
        </select>
        <select
          value={rarity}
          onChange={(e) => setRarity(e.target.value)}
          aria-label="Rareté"
          className="bg-ink border border-line rounded-md px-2 py-2 text-sm"
        >
          <option value="limited">Limited</option>
          <option value="rare">Rare</option>
          <option value="common">Common</option>
          <option value="super_rare">Super Rare</option>
        </select>
        <button
          onClick={run}
          disabled={loading}
          className="bg-flood text-ink font-bold px-4 py-2 rounded-md text-sm disabled:opacity-50 shrink-0"
        >
          {loading ? "…" : "Analyser"}
        </button>
      </div>

      <p className="font-mono text-[11px] text-muted">
        Les 15 joueurs en meilleure forme du championnat. Prix = dernière vente in-season conclue
        (enchère ou achat direct), pas une simple annonce. Tape une ligne pour tout voir sur le joueur.
      </p>

      {noSales && (
        <p className="text-xs text-limited bg-limited/10 border border-limited/40 rounded-md px-2.5 py-2">
          Aucune vente in-season {rarity} conclue récemment sur ces joueurs.
        </p>
      )}

      {loaded && players.length === 0 && (
        <p className="font-mono text-sm text-muted">Aucun joueur retourné pour ce championnat.</p>
      )}

      <ul className="flex flex-col gap-2">
        {players.map((p) => {
          const t = p.inSeasonTrend;
          return (
            <li key={p.slug}>
              <button
                type="button"
                onClick={() =>
                  onSelectPlayer(
                    p.slug,
                    <SaleHistory trend={t} floorInSeason={p.floorInSeason} floorAnySeason={p.floorAnySeason} rarity={rarity} />
                  )
                }
                className="w-full text-left flex items-center gap-3 p-3 rounded-lg bg-ink2 border border-line hover:bg-line/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-flood"
              >
                {p.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
                  <img src={p.picture} alt="" loading="lazy" className="w-10 h-10 rounded-full object-cover bg-ink shrink-0" />
                ) : (
                  <span className="w-10 h-10 rounded-full bg-ink shrink-0" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate flex items-center gap-2">
                    <span className="truncate">{p.name}</span>
                    {p.ownedCards > 0 && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-ok/15 text-ok font-mono">
                        {p.ownedInSeason > 0 ? `${p.ownedInSeason} IS` : `x${p.ownedCards}`}
                      </span>
                    )}
                    {p.injury && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-warn/15 text-warn font-mono">
                        blessé
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted truncate">
                    {POSITION_SHORT[p.position] ?? p.position}
                    {p.club ? ` · ${p.club}` : ""}
                  </p>
                  <p className="font-mono text-[11px] text-muted mt-0.5">
                    L5 <span className={p.avgL5 != null ? SCORE_COLOR_CLASS[scoreColor(p.avgL5)] : ""}>{p.avgL5?.toFixed(0) ?? "—"}</span> · joué {p.app15 ?? "—"}/15
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className={`font-display text-lg leading-none ${t?.lastSale ? "" : "text-muted"}`}>
                    {money(t?.lastSale ?? null)}
                  </p>
                  {t?.trendPct != null ? (
                    <p
                      className={`text-[11px] font-mono ${t.trendPct >= 0 ? "text-warn" : "text-ok"}`}
                      title={
                        t.trendPct >= 0
                          ? "Prix en hausse — plus cher à l'achat qu'avant"
                          : "Prix en baisse — moins cher à l'achat qu'avant"
                      }
                    >
                      {t.trendPct >= 0 ? "▲" : "▼"} {Math.abs(t.trendPct).toFixed(0)}%
                    </p>
                  ) : (
                    <p className="text-[10px] font-mono text-muted">tendance —</p>
                  )}
                  <p className="text-[10px] font-mono text-muted/70">
                    {t?.lastSaleDate ? daysAgo(t.lastSaleDate) : "aucune vente"}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
