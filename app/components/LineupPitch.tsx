"use client";

import { POSITION_SHORT } from "@/lib/types";

export type PitchPlayer = {
  key: string;
  playerSlug: string;
  playerName: string;
  picture: string | null;
  position: string;
  captain?: boolean;
  /** Main number under the name — projected score or start probability, whichever the caller wants foregrounded. */
  statValue: string;
  statLabel?: string;
  /** Short status line under the stat — "banc", "désaccord", "à ajouter"… */
  note?: string;
  noteTone?: "ok" | "warn";
  /** Ring around the avatar, for the same kind of flag as `note` but visible before reading any text. */
  ringTone?: "ok" | "warn" | null;
  faded?: boolean;
};

/**
 * Top-to-bottom, mirroring the pitch itself: attackers nearest the opponent's
 * goal at the top, the goalkeeper alone at the bottom — the same orientation
 * Sorare uses for a line-up, so a fielded or proposed five reads as an actual
 * team shape instead of four unlabeled rows of text.
 */
const ROWS: { position: string; key: string }[] = [
  { position: "Forward", key: "fwd" },
  { position: "Midfielder", key: "mid" },
  { position: "Defender", key: "def" },
  { position: "Goalkeeper", key: "gk" },
];

/**
 * A vertical pitch graphic for one So5 five, positioned by real playing
 * position rather than listed flat — replaces a text list that gave no sense
 * of team shape (how many defenders vs. attackers, who's the flex pick).
 */
export default function LineupPitch({
  players,
  onSelectPlayer,
  emptyMessage,
}: {
  players: PitchPlayer[];
  onSelectPlayer: (slug: string) => void;
  emptyMessage?: string;
}) {
  if (!players.length) {
    return (
      <p className="font-mono text-xs text-muted text-center py-6 border border-dashed border-line rounded-xl">
        {emptyMessage ?? "Aucun joueur à afficher."}
      </p>
    );
  }

  const byPosition = new Map<string, PitchPlayer[]>();
  for (const row of ROWS) byPosition.set(row.position, []);
  for (const p of players) {
    const bucket = byPosition.has(p.position) ? p.position : "Midfielder";
    byPosition.get(bucket)!.push(p);
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-line"
      style={{
        aspectRatio: "5 / 7",
        background: "repeating-linear-gradient(180deg, #173627 0px, #173627 32px, #1B3E2C 32px, #1B3E2C 64px)",
      }}
    >
      <svg viewBox="0 0 100 140" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <g fill="none" stroke="#F5F5F0" strokeOpacity="0.25" strokeWidth="0.5">
          <rect x="3" y="3" width="94" height="134" />
          <line x1="3" y1="70" x2="97" y2="70" />
          <circle cx="50" cy="70" r="13" />
          <rect x="27" y="117" width="46" height="20" />
          <rect x="39" y="132" width="22" height="5" />
          <path d="M 40 117 A 12.5 12.5 0 0 0 60 117" />
          <rect x="27" y="3" width="46" height="20" />
          <rect x="39" y="3" width="22" height="5" />
          <path d="M 40 23 A 12.5 12.5 0 0 1 60 23" />
        </g>
        <circle cx="50" cy="70" r="0.7" fill="#F5F5F0" fillOpacity="0.25" />
      </svg>

      <div className="relative h-full flex flex-col justify-around py-4">
        {ROWS.map((row) => {
          const rowPlayers = byPosition.get(row.position) ?? [];
          if (!rowPlayers.length) return null;
          return (
            <div key={row.key} className="flex justify-center items-start gap-3 sm:gap-6 px-1">
              {rowPlayers.map((p) => (
                <PitchToken key={p.key} player={p} onSelect={onSelectPlayer} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PitchToken({ player, onSelect }: { player: PitchPlayer; onSelect: (slug: string) => void }) {
  const ring = player.ringTone === "warn" ? "ring-warn" : player.ringTone === "ok" ? "ring-ok" : "ring-ink/50";
  return (
    <button
      type="button"
      onClick={() => onSelect(player.playerSlug)}
      className={`flex flex-col items-center gap-1 w-20 sm:w-24 shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-flood ${
        player.faded ? "opacity-55" : ""
      }`}
    >
      <span className="relative block">
        {player.picture ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
          <img
            src={player.picture}
            alt=""
            loading="lazy"
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover bg-ink2 ring-2 ${ring}`}
          />
        ) : (
          <span
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-ink2 grid place-items-center font-display text-xs text-muted ring-2 ${ring}`}
          >
            {POSITION_SHORT[player.position] ?? "?"}
          </span>
        )}
        {player.captain && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-flood text-ink text-[9px] font-bold grid place-items-center ring-2 ring-ink">
            C
          </span>
        )}
      </span>
      <span className="max-w-full px-1.5 py-0.5 rounded bg-ink/85 text-[10px] font-bold leading-tight truncate">
        {player.playerName}
      </span>
      <span className="flex items-baseline gap-1 font-mono text-[10px] leading-none">
        <span className="text-flood font-bold">{player.statValue}</span>
        {player.statLabel && <span className="text-muted">{player.statLabel}</span>}
      </span>
      {player.note && (
        <span className={`text-[9px] font-mono leading-none ${player.noteTone === "warn" ? "text-warn" : player.noteTone === "ok" ? "text-ok" : "text-muted"}`}>
          {player.note}
        </span>
      )}
    </button>
  );
}
