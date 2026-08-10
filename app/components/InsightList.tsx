"use client";

import { useState } from "react";

export type Insight = {
  kind: string;
  cardSlug: string;
  playerSlug: string;
  name: string;
  picture: string | null;
  club: string | null;
  position: string;
  rarity: string;
  reason: string;
  floorPrice: number | null;
  boughtPrice: number | null;
  expected: number | null;
  pStart: number | null;
};

export type InsightGroup = {
  kind: string;
  title: string;
  description: string;
  items: Insight[];
};

/** Colour carries the same meaning everywhere: red costs you, green earns. */
const TONE: Record<string, { dot: string; text: string }> = {
  unavailable: { dot: "bg-warn", text: "text-warn" },
  dead_weight: { dot: "bg-warn", text: "text-warn" },
  loss: { dot: "bg-warn", text: "text-warn" },
  sell_high: { dot: "bg-limited", text: "text-limited" },
  underused: { dot: "bg-ok", text: "text-ok" },
  rising: { dot: "bg-ok", text: "text-ok" },
};

const POS: Record<string, string> = { Goalkeeper: "GK", Defender: "DEF", Midfielder: "MIL", Forward: "ATT" };

export default function InsightList({ group }: { group: InsightGroup }) {
  const [open, setOpen] = useState(true);
  const tone = TONE[group.kind] ?? { dot: "bg-muted", text: "text-muted" };

  return (
    <section className="rounded-lg bg-ink2 border border-line overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="font-display uppercase text-base leading-none block truncate">{group.title}</span>
          <span className="text-[11px] text-muted block truncate mt-0.5">{group.description}</span>
        </span>
        <span className="font-mono text-xs text-muted shrink-0">{group.items.length}</span>
        <span className={`text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <ul className="border-t border-line divide-y divide-line">
          {group.items.map((it) => (
            <li key={it.cardSlug} className="flex items-center gap-3 px-3 py-2.5">
              {it.picture ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
                <img src={it.picture} alt="" loading="lazy" className="w-9 h-9 rounded-full object-cover bg-ink shrink-0" />
              ) : (
                <span className="w-9 h-9 rounded-full bg-ink shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm truncate">{it.name}</p>
                <p className="text-[11px] text-muted truncate">
                  {POS[it.position] ?? it.position}
                  {it.club ? ` · ${it.club}` : ""}
                </p>
              </div>
              <p className={`font-mono text-[11px] text-right shrink-0 max-w-[45%] ${tone.text}`}>{it.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
