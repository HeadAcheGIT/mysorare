"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { cardValue, POSITION_LABEL, type SquadCard } from "@/lib/types";
import type { PlayerDetail, CardSupply } from "@/lib/services/playerDetail";
import PlayerBadges from "./PlayerBadges";

type MarketFloor = {
  floorByRarity: Record<string, number | null>;
  valuation?: { value: number | null } | null;
};

type CompareRow = {
  slug: string;
  name: string;
  club: string | null;
  competitionName: string | null;
  position: string;
  picture: string | null;
  birthDate: string | null;
  owned: boolean;
  rarity: string | null;
  l5: number | null;
  l10: number | null;
  l15: number | null;
  pStart: number | null;
  price: number | null;
  boughtPrice: number | null;
  profit: number | null;
  cardSupply: CardSupply | null;
};

function fromSquadCard(c: SquadCard): CompareRow {
  const price = cardValue(c);
  return {
    slug: c.playerSlug,
    name: c.name,
    club: c.club,
    competitionName: c.competitionName,
    position: c.position,
    picture: c.picture,
    birthDate: c.birthDate,
    owned: true,
    rarity: c.rarity,
    l5: c.l5,
    l10: c.l10,
    l15: c.l15,
    pStart: c.pStart,
    price,
    boughtPrice: c.boughtPrice,
    profit: price != null && c.boughtPrice != null ? price - c.boughtPrice : null,
    cardSupply: null,
  };
}

function avg(scores: number[]): number | null {
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

/**
 * A player not in the gallery has none of the app's own projection data
 * (Projection rows only exist for cards the sync pipeline has scored), so
 * L5/L10/L15 are derived here from the same past-games list PlayerPopup
 * already fetches — real So5 scores, just averaged locally instead of by the
 * projection pipeline. pStart is left null rather than guessed.
 */
async function fetchUnowned(slug: string): Promise<CompareRow> {
  const [detail, market] = await Promise.all([
    apiFetch<PlayerDetail>(`/api/player?slug=${encodeURIComponent(slug)}`),
    apiFetch<MarketFloor>(`/api/market/price?slug=${encodeURIComponent(slug)}`).catch(() => null),
  ]);
  const played = detail.pastGames.filter((g) => g.so5Score != null).map((g) => g.so5Score as number);

  return {
    slug,
    name: detail.name,
    club: detail.club?.name ?? null,
    competitionName: detail.competitionName,
    position: detail.position,
    picture: detail.picture,
    birthDate: detail.birthDate,
    owned: false,
    rarity: null,
    l5: avg(played.slice(0, 5)),
    l10: avg(played.slice(0, 10)),
    l15: avg(played.slice(0, 15)),
    pStart: null,
    price: market?.valuation?.value ?? market?.floorByRarity?.limited ?? null,
    boughtPrice: null,
    profit: null,
    cardSupply: detail.cardSupply,
  };
}

const one = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const eur = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)} €`);

/**
 * Two to four players side by side. Owned cards render instantly from the
 * squad already in memory (no request); anything not owned is fetched the
 * same way PlayerPopup already does, one player at a time — card supply is
 * then filled in for every row (owned included) as its own background
 * request, since the squad itself never carries that figure.
 */
export default function PlayerCompare({
  slugs,
  squad,
  onSelectPlayer,
  onRemove,
  onClose,
}: {
  slugs: string[];
  squad: SquadCard[];
  onSelectPlayer: (slug: string) => void;
  onRemove: (slug: string) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Record<string, CompareRow | null | undefined>>({});

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
    setRows({});

    for (const slug of slugs) {
      const owned = squad.find((c) => c.playerSlug === slug);
      if (owned) {
        const base = fromSquadCard(owned);
        setRows((r) => (cancelled ? r : { ...r, [slug]: base }));
        apiFetch<PlayerDetail>(`/api/player?slug=${encodeURIComponent(slug)}`)
          .then((d) =>
            setRows((r) => {
              const cur = r[slug];
              return cancelled || !cur ? r : { ...r, [slug]: { ...cur, cardSupply: d.cardSupply } };
            })
          )
          .catch(() => {});
        continue;
      }

      fetchUnowned(slug)
        .then((row) => setRows((r) => (cancelled ? r : { ...r, [slug]: row })))
        .catch(() => setRows((r) => (cancelled ? r : { ...r, [slug]: null })));
    }

    return () => {
      cancelled = true;
    };
  }, [slugs, squad]);

  const gridStyle = { gridTemplateColumns: `88px repeat(${slugs.length}, minmax(0, 1fr))` };

  const metric = (label: string, render: (row: CompareRow) => React.ReactNode) => (
    <div className="contents">
      <div className="py-2 pr-2 text-[10px] font-mono uppercase tracking-wide text-muted flex items-center">
        {label}
      </div>
      {slugs.map((slug) => {
        const row = rows[slug];
        return (
          <div key={slug} className="py-2 px-1 text-xs border-t border-line flex items-center">
            {row ? render(row) : <span className="text-muted">—</span>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Comparateur de joueurs"
        className="relative w-full sm:max-w-2xl bg-ink2 border-t sm:border border-line sm:rounded-xl rounded-t-2xl max-h-[90vh] overflow-y-auto safe-bottom"
      >
        <div className="flex items-center justify-between gap-2 p-4 border-b border-line">
          <h2 className="font-display text-xl uppercase leading-none">Comparateur</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 w-8 h-8 grid place-items-center rounded-md border border-line text-muted"
          >
            ✕
          </button>
        </div>

        <div className="p-4 overflow-x-auto">
          <div className="grid gap-x-2 min-w-[480px]" style={gridStyle}>
            <div />
            {slugs.map((slug) => {
              const row = rows[slug];
              return (
                <div key={slug} className="text-center px-1">
                  {row === undefined ? (
                    <p className="font-mono text-[11px] text-muted py-4">Chargement…</p>
                  ) : row === null ? (
                    <p className="font-mono text-[11px] text-warn py-4">Introuvable</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectPlayer(slug)}
                      className="flex flex-col items-center gap-1 w-full"
                    >
                      {row.picture ? (
                        // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
                        <img src={row.picture} alt="" className="w-12 h-12 rounded-full object-cover bg-ink" />
                      ) : (
                        <span className="w-12 h-12 rounded-full bg-ink" />
                      )}
                      <span className="font-bold text-xs leading-tight text-center hover:underline decoration-muted underline-offset-2">
                        {row.name}
                      </span>
                      <PlayerBadges birthDate={row.birthDate} competitionName={row.competitionName} />
                    </button>
                  )}
                  <button
                    onClick={() => onRemove(slug)}
                    aria-label={`Retirer ${row?.name ?? "ce joueur"} du comparateur`}
                    className="mt-1 text-[10px] font-mono text-muted hover:text-warn"
                  >
                    retirer
                  </button>
                </div>
              );
            })}

            {metric("Club", (r) => <span className="truncate block">{r.club ?? "sans club"}</span>)}
            {metric("Poste", (r) => POSITION_LABEL[r.position] ?? r.position)}
            {metric("Rareté", (r) => (r.owned && r.rarity ? r.rarity : "—"))}
            {metric("L5", (r) => one(r.l5))}
            {metric("L10", (r) => one(r.l10))}
            {metric("L15", (r) => one(r.l15))}
            {metric("Titu probable", (r) => (r.pStart != null ? `${Math.round(r.pStart * 100)}%` : "—"))}
            {metric("Prix", (r) => eur(r.price))}
            {metric("Acheté", (r) => eur(r.boughtPrice))}
            {metric("Plus/moins-value", (r) =>
              r.profit == null ? (
                "—"
              ) : (
                <span className={r.profit >= 0 ? "text-ok" : "text-warn"}>
                  {r.profit >= 0 ? "+" : ""}
                  {r.profit.toFixed(2)} €
                </span>
              )
            )}
            {metric("Offre Limited", (r) => r.cardSupply?.limited ?? "—")}
            {metric("Offre Rare", (r) => r.cardSupply?.rare ?? "—")}
          </div>
        </div>
      </div>
    </div>
  );
}
