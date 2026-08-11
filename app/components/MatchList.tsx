"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { relativeDate } from "@/lib/format";

type GameEntry = {
  id: string;
  date: string;
  status: string;
  competition: string | null;
  homeTeam: { name: string; picture: string | null } | null;
  awayTeam: { name: string; picture: string | null } | null;
  homeScore: number | null;
  awayScore: number | null;
  so5Score: number | null;
};

type PlayerDetail = {
  slug: string;
  pastGames: GameEntry[];
  futureGames: GameEntry[];
};

export type { GameEntry, PlayerDetail as MatchListDetail };

function Row({ game }: { game: GameEntry }) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs truncate">
          {game.homeTeam?.name ?? "?"} <span className="text-muted">vs</span> {game.awayTeam?.name ?? "?"}
        </p>
        <p className="text-[10px] font-mono text-muted truncate">
          {relativeDate(game.date)}
          {game.competition ? ` · ${game.competition}` : ""}
        </p>
      </div>
      <div className="text-right shrink-0 font-mono text-xs">
        {game.homeScore != null && game.awayScore != null && (
          <span className="text-muted">
            {game.homeScore}-{game.awayScore}
          </span>
        )}
        {game.so5Score != null && (
          <span className={`ml-2 font-bold ${game.so5Score > 0 ? "text-flood" : "text-muted"}`}>
            {game.so5Score.toFixed(1)}
          </span>
        )}
        {game.status === "postponed" && <span className="text-warn ml-2">reporté</span>}
      </div>
    </li>
  );
}

/**
 * A player's recent results (with their So5 score) and upcoming fixtures.
 * Lazy-loaded on open rather than bundled into the squad/scouting payloads —
 * it's one extra request per player only paid when someone actually wants it.
 *
 * `initialGames` skips that fetch when the caller already has the games (e.g.
 * PlayerPopup, which fetches the full player detail itself) — avoids firing
 * the same /api/player request twice for one popup open.
 */
export default function MatchList({
  slug,
  initialGames,
}: {
  slug: string;
  initialGames?: { pastGames: GameEntry[]; futureGames: GameEntry[] };
}) {
  const [detail, setDetail] = useState<PlayerDetail | null>(
    initialGames ? { slug, ...initialGames } : null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialGames) return;
    let cancelled = false;
    setDetail(null);
    setError(null);
    apiFetch<PlayerDetail>(`/api/player?slug=${encodeURIComponent(slug)}`)
      .then((d) => !cancelled && setDetail(d))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Indisponible"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialGames is a fetch-skip flag, not reactive data
  }, [slug]);

  if (error) return <p className="text-xs text-warn">{error}</p>;
  if (!detail) return <p className="font-mono text-xs text-muted">Chargement…</p>;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">Prochains matchs</p>
        {detail.futureGames.length ? (
          <ul className="divide-y divide-line">
            {detail.futureGames.map((g) => (
              <Row key={g.id} game={g} />
            ))}
          </ul>
        ) : (
          <p className="font-mono text-xs text-muted">Aucun match programmé pour l&apos;instant.</p>
        )}
      </div>

      <div>
        <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">Matchs récents</p>
        {detail.pastGames.length ? (
          <ul className="divide-y divide-line">
            {detail.pastGames.map((g) => (
              <Row key={g.id} game={g} />
            ))}
          </ul>
        ) : (
          <p className="font-mono text-xs text-muted">Aucun historique disponible.</p>
        )}
      </div>
    </div>
  );
}
