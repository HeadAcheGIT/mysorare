"use client";

import { useEffect, useState } from "react";

export type GameWeek = {
  fixture: string | null;
  displayName: string | null;
  gameWeek: number | null;
  cutOffDate: string | null;
  startDate: string | null;
  locked: boolean | null;
};

function remaining(target: Date) {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
    urgent: ms < 6 * 3600 * 1000,
  };
}

/**
 * Countdown to the line-up lock. Ticks once a minute rather than once a
 * second: the deadline is hours away, and a spinning seconds counter would
 * pull attention away from the squad list for no added information.
 */
export default function Deadline({ gw }: { gw: GameWeek }) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!gw.cutOffDate) {
    return (
      <div className="rounded-lg bg-ink2 border border-line px-3 py-2.5">
        <p className="font-mono text-xs text-muted">
          Game week inconnue — lance « Actualiser la game week » dans Données.
        </p>
      </div>
    );
  }

  const cut = new Date(gw.cutOffDate);
  const left = remaining(cut);
  const label = gw.displayName ?? gw.fixture ?? "Game week";

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 flex items-center justify-between gap-3 ${
        left?.urgent ? "bg-warn/10 border-warn" : "bg-ink2 border-line"
      }`}
    >
      <div className="min-w-0">
        <p className="font-display uppercase text-lg leading-none truncate">{label}</p>
        <p className="font-mono text-[11px] text-muted mt-0.5">
          Clôture {cut.toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <div className="text-right shrink-0">
        {left ? (
          <>
            <p className={`font-display text-2xl leading-none ${left.urgent ? "text-warn" : "text-flood"}`}>
              {left.days > 0 ? `${left.days}j ${left.hours}h` : `${left.hours}h ${left.minutes}m`}
            </p>
            <p className="font-mono text-[10px] text-muted">restant</p>
          </>
        ) : (
          <p className="font-display text-xl text-warn leading-none">Fermée</p>
        )}
      </div>
    </div>
  );
}
