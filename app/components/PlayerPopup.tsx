"use client";

import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/apiFetch";
import MatchList, { type MatchListDetail } from "./MatchList";
import PlayerNews from "./PlayerNews";
import PlayerBadges from "./PlayerBadges";
import { POSITION_LABEL } from "@/lib/types";
import type { CardSupply } from "@/lib/services/playerDetail";
import { CardSupplyStats } from "./CardSupplyBlock";

type PlayerDetail = MatchListDetail & {
  name: string;
  position: string;
  age: number | null;
  picture: string | null;
  club: { name: string; picture: string | null } | null;
  injury: string | null;
  birthDate: string | null;
  competitionName: string | null;
  cardSupply: CardSupply | null;
};

type MarketFloor = { floorByRarity: Record<string, number | null>; listedCount: number };

const RARITY_LABEL: Record<string, string> = {
  common: "Common",
  limited: "Limited",
  rare: "Rare",
  super_rare: "Super Rare",
  unique: "Unique",
};

/**
 * The generic "who is this player" popup: bio, injury status, next fixtures,
 * recent results with So5 score, and current market floor by rarity. Opened
 * from anywhere a player's name appears without an owned card behind it
 * (Semaine insights, scouting, search, watchlist) — owned cards open the
 * richer PlayerSheet instead, which adds price-paid and your projection on
 * top of everything shown here.
 *
 * `extra` lets a caller slot in context it already has (e.g. Scouting's sale
 * trend) without this component needing to know about every possible source.
 */
export default function PlayerPopup({
  slug,
  onClose,
  extra,
  compared,
  onToggleCompare,
}: {
  slug: string;
  onClose: () => void;
  extra?: ReactNode;
  compared?: boolean;
  onToggleCompare?: () => void;
}) {
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [market, setMarket] = useState<MarketFloor | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setMarket(null);
    setError(null);
    Promise.all([
      apiFetch<PlayerDetail>(`/api/player?slug=${encodeURIComponent(slug)}`),
      // Non-fatal: the bio and matches are the point of this popup, a market
      // hiccup shouldn't block them.
      apiFetch<MarketFloor>(`/api/market/price?slug=${encodeURIComponent(slug)}`).catch(() => null),
    ])
      .then(([d, m]) => {
        if (cancelled) return;
        setDetail(d);
        setMarket(m);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Joueur introuvable"));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const listedRarities = market ? Object.entries(market.floorByRarity).filter(([, v]) => v != null) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={detail?.name ?? "Joueur"}
        className="relative w-full sm:max-w-md bg-ink2 border-t sm:border border-line sm:rounded-xl rounded-t-2xl max-h-[85vh] overflow-y-auto safe-bottom"
      >
        {error ? (
          <div className="p-4">
            <p className="text-sm text-warn">{error}</p>
            <button onClick={onClose} className="mt-3 text-xs border border-line rounded-md px-3 py-1.5">
              Fermer
            </button>
          </div>
        ) : !detail ? (
          <div className="p-4">
            <p className="font-mono text-sm text-muted">Chargement…</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 p-4 border-b border-line">
              {detail.picture ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
                <img src={detail.picture} alt="" className="w-16 h-16 rounded-full object-cover bg-ink shrink-0" />
              ) : (
                <span className="w-16 h-16 rounded-full bg-ink shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-2xl uppercase leading-none truncate">{detail.name}</h2>
                <p className="text-xs text-muted truncate mt-1">
                  {POSITION_LABEL[detail.position] ?? detail.position}
                  {detail.age != null && ` · ${detail.age} ans`}
                </p>
                <p className="text-xs text-muted truncate flex items-center gap-1.5 mt-0.5">
                  {detail.club?.picture && (
                    // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
                    <img src={detail.club.picture} alt="" className="w-4 h-4 object-contain" />
                  )}
                  {detail.club?.name ?? "sans club"}
                </p>
                <p className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <PlayerBadges birthDate={detail.birthDate} competitionName={detail.competitionName} />
                </p>
              </div>
              <div className="shrink-0 flex flex-col gap-1.5">
                {onToggleCompare && (
                  <button
                    onClick={onToggleCompare}
                    aria-pressed={compared}
                    aria-label={compared ? "Retirer du comparateur" : "Ajouter au comparateur"}
                    className={`w-8 h-8 grid place-items-center rounded-md border text-sm font-bold ${
                      compared ? "bg-flood text-ink border-flood" : "border-line text-muted"
                    }`}
                  >
                    {compared ? "✓" : "+"}
                  </button>
                )}
                <button
                  onClick={onClose}
                  aria-label="Fermer"
                  className="w-8 h-8 grid place-items-center rounded-md border border-line text-muted"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {detail.injury && (
                <p className="text-sm text-warn bg-warn/10 border border-warn/40 rounded-md px-3 py-2">
                  Blessé — {detail.injury}
                </p>
              )}

              {extra}

              {listedRarities.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">
                    Prix plancher actuel
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {listedRarities.map(([r, v]) => (
                      <div key={r} className="bg-ink rounded-md px-3 py-2">
                        <p className="text-[10px] font-mono uppercase tracking-wide text-muted">
                          {RARITY_LABEL[r] ?? r}
                        </p>
                        <p className="font-display text-xl leading-tight">{v?.toFixed(2)} €</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.cardSupply && <CardSupplyStats supply={detail.cardSupply} />}

              <div>
                <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">Matchs</p>
                <div className="bg-ink rounded-md px-3 py-2">
                  <MatchList
                    slug={detail.slug}
                    initialGames={{
                      pastGames: detail.pastGames,
                      futureGames: detail.futureGames,
                      friendlies: detail.friendlies,
                      friendliesStatus: detail.friendliesStatus,
                    }}
                  />
                </div>
              </div>

              <div>
                <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">Actualités</p>
                <div className="bg-ink rounded-md px-3 py-2">
                  <PlayerNews name={detail.name} />
                </div>
              </div>

              <a
                href={`https://sorare.com/football/players/${detail.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-sm border border-line rounded-md py-2 text-muted"
              >
                Voir sur Sorare ↗
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
