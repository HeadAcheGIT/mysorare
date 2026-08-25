"use client";

import { useMemo } from "react";

export interface PricePoint {
  floorPrice: number;
  capturedAt: string | Date;
  rarity?: string;
}

interface PriceHistoryChartProps {
  points: PricePoint[];
  rarity?: string;
}

export default function PriceHistoryChart({ points, rarity }: PriceHistoryChartProps) {
  const filtered = useMemo(() => {
    if (!points || points.length === 0) return [];
    const list = rarity ? points.filter((p) => !p.rarity || p.rarity === rarity) : points;
    return [...list].sort(
      (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
    );
  }, [points, rarity]);

  if (filtered.length < 2) {
    return (
      <div className="bg-ink rounded-md p-3 text-center">
        <p className="text-xs text-muted font-mono">
          {filtered.length === 1
            ? `1 relevé de floor : ${filtered[0].floorPrice.toFixed(2)} € (historique en cours de collecte)`
            : "Pas encore d'historique de floor price enregistré"}
        </p>
      </div>
    );
  }

  const prices = filtered.map((p) => p.floorPrice);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceSpan = maxPrice - minPrice || 1;

  const width = 300;
  const height = 80;
  const paddingX = 10;
  const paddingTop = 12;
  const paddingBottom = 16;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingTop - paddingBottom;

  const firstDate = new Date(filtered[0].capturedAt).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
  const lastDate = new Date(filtered[filtered.length - 1].capturedAt).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });

  const coordinates = filtered.map((p, idx) => {
    const x = paddingX + (idx / (filtered.length - 1)) * innerWidth;
    const y = paddingTop + innerHeight - ((p.floorPrice - minPrice) / priceSpan) * innerHeight;
    return { x, y, price: p.floorPrice };
  });

  const pathD = coordinates.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, "");

  const areaD = `${pathD} L ${coordinates[coordinates.length - 1].x} ${height - paddingBottom} L ${coordinates[0].x} ${height - paddingBottom} Z`;

  const latest = filtered[filtered.length - 1].floorPrice;
  const first = filtered[0].floorPrice;
  const diffPct = first > 0 ? ((latest - first) / first) * 100 : 0;

  return (
    <div className="bg-ink rounded-md p-3 border border-line/60">
      <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
        <span className="text-muted">Évolution du Floor Price</span>
        <span className={diffPct >= 0 ? "text-ok font-bold" : "text-warn font-bold"}>
          {diffPct >= 0 ? "+" : ""}
          {diffPct.toFixed(1)}% ({latest.toFixed(2)} €)
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-20 overflow-visible select-none"
        aria-label="Graphique d'historique du floor price"
      >
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--flood, #00d2ff)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--flood, #00d2ff)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        <path d={areaD} fill="url(#priceGradient)" />
        <path d={pathD} fill="none" stroke="var(--flood, #00d2ff)" strokeWidth="2" strokeLinecap="round" />

        {/* Min and Max dotted guides */}
        <text
          x={paddingX}
          y={paddingTop - 2}
          fill="currentColor"
          className="text-[9px] fill-muted font-mono"
        >
          max {maxPrice.toFixed(2)}€
        </text>
        <text
          x={width - paddingX}
          y={height - 2}
          textAnchor="end"
          fill="currentColor"
          className="text-[9px] fill-muted font-mono"
        >
          min {minPrice.toFixed(2)}€
        </text>

        {/* Latest point circle */}
        {coordinates.length > 0 && (
          <circle
            cx={coordinates[coordinates.length - 1].x}
            cy={coordinates[coordinates.length - 1].y}
            r="3.5"
            fill="var(--flood, #00d2ff)"
          />
        )}
      </svg>

      <div className="flex items-center justify-between text-[10px] font-mono text-muted mt-1">
        <span>{firstDate}</span>
        <span>{filtered.length} relevé{filtered.length > 1 ? "s" : ""}</span>
        <span>{lastDate}</span>
      </div>
    </div>
  );
}
