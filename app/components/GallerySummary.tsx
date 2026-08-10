"use client";

import type { SquadCard } from "@/lib/types";

/**
 * Portfolio header. Uses floor price rather than the listed price for the
 * total: floor is what the market will actually pay right now, so it reads as
 * a conservative valuation rather than an optimistic one.
 */
export default function GallerySummary({ cards }: { cards: SquadCard[] }) {
  const value = cards.reduce((sum, c) => sum + (c.floorPrice ?? 0), 0);
  const spent = cards.reduce((sum, c) => sum + (c.boughtPrice ?? 0), 0);
  const delta = spent > 0 ? value - spent : null;
  const unavailable = cards.filter((c) => c.injury || c.suspended).length;

  const items: [string, string, string?][] = [
    ["Cartes", String(cards.length)],
    ["Valeur", `${value.toFixed(0)} €`],
    [
      "Plus-value",
      delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(0)} €`,
      delta == null ? undefined : delta >= 0 ? "text-ok" : "text-warn",
    ],
    ["Indispos", String(unavailable), unavailable > 0 ? "text-warn" : undefined],
  ];

  return (
    <dl className="grid grid-cols-4 gap-2 mb-4">
      {items.map(([label, value, tone]) => (
        <div key={label} className="bg-ink2 border border-line rounded-md px-2 py-2 text-center">
          <dt className="text-[10px] font-mono uppercase tracking-wide text-muted truncate">{label}</dt>
          <dd className={`font-display text-lg leading-tight ${tone ?? ""}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
