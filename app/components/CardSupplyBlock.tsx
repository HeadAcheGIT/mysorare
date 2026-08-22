"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import type { CardSupply } from "@/lib/services/playerDetail";

/** Limited/Rare copies of a player in circulation this season — "is this price justified by scarcity". */
export function CardSupplyStats({ supply }: { supply: CardSupply }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">
        Offre en circulation · saison {supply.season}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-ink rounded-md px-3 py-2">
          <p className="text-[10px] font-mono uppercase tracking-wide text-muted">Limited</p>
          <p className="font-display text-xl leading-tight">{supply.limited}</p>
        </div>
        <div className="bg-ink rounded-md px-3 py-2">
          <p className="text-[10px] font-mono uppercase tracking-wide text-muted">Rare</p>
          <p className="font-display text-xl leading-tight">{supply.rare}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Self-fetching version, for a screen (PlayerSheet) that only has the owned
 * card's own stats in memory — not the live, market-wide supply figure.
 * Same lazy-per-player pattern as PlayerNews/MatchList: pulling this into the
 * squad-load path would mean one extra Sorare call per card across a
 * 400-card gallery instead of one per player actually opened.
 */
export default function FetchedCardSupply({ slug }: { slug: string }) {
  const [supply, setSupply] = useState<CardSupply | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setSupply(undefined);
    apiFetch<{ cardSupply: CardSupply | null }>(`/api/player?slug=${encodeURIComponent(slug)}`)
      .then((d) => !cancelled && setSupply(d.cardSupply))
      .catch(() => !cancelled && setSupply(null));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!supply) return null;
  return <CardSupplyStats supply={supply} />;
}
