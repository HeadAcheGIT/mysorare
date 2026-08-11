"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { POSITION_SHORT } from "@/lib/types";

type Money = { amount: number; currency: string } | null;

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
  ownedCards: number;
  ownedInSeason: number;
};

type League = { slug: string; name: string; country: string | null };

const money = (m: Money) => (m == null ? "—" : `${m.amount.toFixed(2)} ${m.currency === "USD" ? "$" : "€"}`);

/** Leagues worth putting first for a French manager; the rest stay alphabetical. */
const PINNED = ["ligue-1-fr", "premier-league-gb-eng", "laliga-es", "serie-a-it", "bundesliga-de", "ligue-2-fr"];

/**
 * "Should I buy this?" for one league at a time.
 *
 * Shows form and playing time next to the in-season floor, because a cheap card
 * for someone who doesn't start is not a bargain, and flags players already in
 * your gallery so the list never recommends a duplicate.
 */
export default function Scouting({ onError }: { onError: (m: string) => void }) {
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

  const noneInSeason = loaded && players.length > 0 && players.every((p) => p.floorInSeason == null);

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
          {leagues.map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.name}
            </option>
          ))}
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
        Les 15 joueurs en meilleure forme du championnat, avec le prix plancher actuel. Sans clé API
        Sorare, 15 est le maximum par requête.
      </p>

      {noneInSeason && (
        <p className="text-xs text-limited bg-limited/10 border border-limited/40 rounded-md px-2.5 py-2">
          Aucune carte in-season {rarity} en vente sur ces joueurs actuellement. La colonne « toutes
          saisons » donne le prix des cartes plus anciennes, qui ne comptent pas pour les compétitions
          in-season.
        </p>
      )}

      {loaded && players.length === 0 && (
        <p className="font-mono text-sm text-muted">Aucun joueur retourné pour ce championnat.</p>
      )}

      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <li key={p.slug} className="p-3 rounded-lg bg-ink2 border border-line flex items-center gap-3">
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
                L5 {p.avgL5?.toFixed(0) ?? "—"} · joué {p.app15 ?? "—"}/15
              </p>
            </div>

            <div className="text-right shrink-0">
              <p className={`font-display text-lg leading-none ${p.floorInSeason ? "text-flood" : "text-muted"}`}>
                {money(p.floorInSeason)}
              </p>
              <p className="text-[10px] font-mono text-muted">in-season</p>
              <p className="text-[11px] font-mono text-muted mt-1">{money(p.floorAnySeason)}</p>
              <p className="text-[10px] font-mono text-muted/70">toutes saisons</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
