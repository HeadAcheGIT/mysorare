"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { POSITION_SHORT, RARITY_CLASS, TRACKED_RARITIES, compareNullable, u23SortValue } from "@/lib/types";
import { formatMoney as money, relativeDate as daysAgo } from "@/lib/format";
import { scoreColor, SCORE_COLOR_CLASS } from "@/lib/types";
import SortControl, { type SortDirection } from "./SortControl";
import PlayerBadges from "./PlayerBadges";
import { reliableForm, valuePerEuro, isThinSample } from "@/lib/scoutingRank";

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
  birthDate: string | null;
  avgL5: number | null;
  avgL10Played: number | null;
  app15: number | null;
  injury: string | null;
  floorInSeason: Money;
  floorAnySeason: Money;
  inSeasonTrend: SaleTrend | null;
  /**
   * What the card actually trades at, from completed sales — see
   * lib/valuation.ts. The last sale alone is one transaction and far too
   * noisy to price on.
   */
  valuation: Valuation | null;
  ownedCards: number;
  ownedInSeason: number;
  lastPlayedAt: string | null;
  clubAtLastGame: { slug: string; name: string } | null;
};

type Valuation = {
  value: number | null;
  low: number | null;
  high: number | null;
  sampleSize: number;
  trendPct: number | null;
  launchPremium: boolean;
  thin: boolean;
};

/** What the per-player pass fills in, once the list is already on screen. */
type PlayerContext = {
  trend: SaleTrend | null;
  valuation: Valuation | null;
  lastPlayedAt: string | null;
  clubAtLastGame: { slug: string; name: string } | null;
};

type League = { slug: string; name: string; country: string | null };

/**
 * Beyond this, a form average describes a different period rather than current
 * form — a summer break, a long injury. Set past a normal fortnight of
 * international duty so it only fires on genuinely stale data.
 */
const STALE_DAYS = 45;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/** Leagues worth putting first for a French manager; the rest stay alphabetical. */
const PINNED = ["ligue-1-fr", "premier-league-gb-eng", "laliga-es", "serie-a-it", "bundesliga-de", "ligue-2-fr"];

type ScoutSortKey = "value" | "form" | "played" | "price" | "trend" | "name" | "u23";

const SCOUT_SORTS: [ScoutSortKey, string][] = [
  // Value first, and the default: "what do I get per euro" is the question a
  // scouting screen exists to answer. Form alone ranked a reserve keeper who
  // had played once above every regular starter — see lib/scoutingRank.ts.
  ["value", "Rapport qualité/prix"],
  ["form", "Forme (L5)"],
  ["played", "Régularité"],
  ["price", "Prix"],
  ["trend", "Tendance"],
  ["name", "Nom"],
  ["u23", "U23"],
];

const SCOUT_DEFAULT_DIRECTION: Record<ScoutSortKey, SortDirection> = {
  value: "desc",
  form: "desc",
  played: "desc",
  price: "asc", // shopping list — cheapest first by default
  trend: "asc", // falling price first — the buying opportunity
  name: "asc",
  u23: "desc",
};

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
  /** Rows still waiting on their price/recency pass — drives the progress line. */
  const [enriching, setEnriching] = useState(0);
  const runToken = useRef(0);
  const [sort, setSort] = useState<ScoutSortKey>("value");
  const [direction, setDirection] = useState<SortDirection>(SCOUT_DEFAULT_DIRECTION.value);

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

  /**
   * Two passes on purpose. The list itself is one cheap request; prices and
   * recency are one paced request per player, which for fifteen players is
   * close to a minute. Fetching them inline meant a blank screen for that
   * whole minute. Now the names, form and playing time land in a couple of
   * seconds and each row fills in behind them.
   */
  const run = useCallback(async () => {
    setLoading(true);
    setEnriching(0);
    try {
      const data = await apiFetch<{ players: ScoutPlayer[] }>(
        `/api/scouting?league=${encodeURIComponent(league)}&rarity=${rarity}`
      );
      setPlayers(data.players);
      setLoaded(true);
      setLoading(false);

      // Guards against a slow fill still writing into the list after the user
      // has switched league or rarity.
      const token = ++runToken.current;
      setEnriching(data.players.length);
      for (const p of data.players) {
        if (runToken.current !== token) return;
        const ctx = await apiFetch<PlayerContext>(
          `/api/scouting?player=${encodeURIComponent(p.slug)}&rarity=${rarity}`
        ).catch(() => null);
        if (runToken.current !== token) return;
        setEnriching((n) => n - 1);
        if (!ctx) continue;
        setPlayers((prev) =>
          prev.map((x) =>
            x.slug === p.slug
              ? { ...x, inSeasonTrend: ctx.trend, valuation: ctx.valuation, lastPlayedAt: ctx.lastPlayedAt, clubAtLastGame: ctx.clubAtLastGame }
              : x
          )
        );
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Scouting indisponible");
      setLoading(false);
      setEnriching(0);
    }
  }, [league, rarity, onError]);

  const noSales = loaded && players.length > 0 && players.every((p) => !p.inSeasonTrend?.sales.length);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      if (sort === "name") {
        const cmp = a.name.localeCompare(b.name, "fr");
        return direction === "asc" ? cmp : -cmp;
      }
      if (sort === "played") return compareNullable(a.app15, b.app15, direction);
      if (sort === "price") return compareNullable(a.inSeasonTrend?.lastSale?.amount, b.inSeasonTrend?.lastSale?.amount, direction);
      if (sort === "trend") return compareNullable(a.inSeasonTrend?.trendPct, b.inSeasonTrend?.trendPct, direction);
      if (sort === "u23") return compareNullable(u23SortValue(a.birthDate), u23SortValue(b.birthDate), direction);
      if (sort === "value") return compareNullable(valuePerEuro(a), valuePerEuro(b), direction);
      return compareNullable(reliableForm(a), reliableForm(b), direction);
    });
  }, [players, sort, direction]);

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
          {/* Driven by the same list the API validates against, so the picker
              can't offer a rarity the route rejects. */}
          {TRACKED_RARITIES.map((r) => (
            <option key={r} value={r}>
              {RARITY_CLASS[r].label}
            </option>
          ))}
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

      {players.length > 0 && (
        <SortControl
          sortKey={sort}
          onSortKey={(k) => {
            setSort(k);
            setDirection(SCOUT_DEFAULT_DIRECTION[k]);
          }}
          options={SCOUT_SORTS}
          direction={direction}
          onDirection={setDirection}
        />
      )}

      {enriching > 0 && (
        <p className="font-mono text-[11px] text-muted">
          Prix et fraîcheur en cours de chargement — {enriching} joueur{enriching > 1 ? "s" : ""} restant
          {enriching > 1 ? "s" : ""}. La liste est déjà triable.
        </p>
      )}

      {noSales && (
        <p className="text-xs text-limited bg-limited/10 border border-limited/40 rounded-md px-2.5 py-2">
          Aucune vente in-season {rarity} conclue récemment sur ces joueurs.
        </p>
      )}

      {loaded && players.length === 0 && (
        <p className="font-mono text-sm text-muted">Aucun joueur retourné pour ce championnat.</p>
      )}

      <ul className="flex flex-col gap-2">
        {sortedPlayers.map((p) => {
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
                    <PlayerBadges birthDate={p.birthDate} />
                  </p>
                  <p className="text-xs text-muted truncate">
                    {POSITION_SHORT[p.position] ?? p.position}
                    {p.club ? ` · ${p.club}` : ""}
                  </p>
                  <p className="font-mono text-[11px] text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>
                      L5{" "}
                      <span className={p.avgL5 != null ? SCORE_COLOR_CLASS[scoreColor(p.avgL5)] : ""}>
                        {p.avgL5?.toFixed(0) ?? "—"}
                      </span>{" "}
                      · joué {p.app15 ?? "—"}/15
                    </span>
                    {/* The average is real, the confidence in it isn't — say so
                        rather than letting a one-game score read as form. */}
                    {isThinSample(p.app15) && (
                      <span
                        className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-warn/15 text-warn"
                        title="Trop peu de matchs derrière cette moyenne pour s'y fier — le classement en tient compte."
                      >
                        peu de matchs
                      </span>
                    )}
                    {/* A form average is only about current form if he has
                        played recently, and only about this club if he was at
                        it. Both are silent traps otherwise. */}
                    {(() => {
                      const d = daysSince(p.lastPlayedAt);
                      return d != null && d >= STALE_DAYS ? (
                        <span
                          className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-warn/15 text-warn"
                          title={`Dernier match il y a ${d} jours — ces moyennes ne décrivent pas sa forme actuelle.`}
                        >
                          pas joué depuis {d} j
                        </span>
                      ) : null;
                    })()}
                    {p.clubAtLastGame && p.club && p.clubAtLastGame.name !== p.club && (
                      <span
                        className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-limited/15 text-limited"
                        title={`Ces statistiques ont été réalisées à ${p.clubAtLastGame.name}, avant son arrivée à ${p.club}.`}
                      >
                        stats à {p.clubAtLastGame.name}
                      </span>
                    )}
                    {valuePerEuro(p) != null && (
                      <span className="shrink-0 text-muted/70" title="Points de forme (pondérés par le temps de jeu) par euro">
                        {valuePerEuro(p)!.toFixed(2)} pts/€
                      </span>
                    )}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  {/* The valuation, not the last sale: one trade can sit
                      three times off the market (Lopez went 6,38 € → 20,14 €
                      → 8,33 € on consecutive sales). */}
                  <p className={`font-display text-lg leading-none ${p.valuation?.value != null ? "" : "text-muted"}`}>
                    {p.valuation?.value != null
                      ? money({ amount: p.valuation.value, currency: "EUR" })
                      : money(t?.lastSale ?? null)}
                  </p>
                  {p.valuation?.value != null && p.valuation.sampleSize > 0 && (
                    <p
                      className="text-[10px] font-mono text-muted/70"
                      title={`Médiane pondérée de ${p.valuation.sampleSize} ventes conclues${
                        p.valuation.low != null ? ` · de ${p.valuation.low} à ${p.valuation.high} €` : ""
                      }`}
                    >
                      sur {p.valuation.sampleSize} ventes
                    </p>
                  )}
                  {p.valuation?.launchPremium && (
                    <p
                      className="text-[10px] font-mono text-limited"
                      title="Les premières séries de la saison se sont vendues bien plus cher — le prix n'a pas fini de se stabiliser."
                    >
                      sortie récente
                    </p>
                  )}
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
