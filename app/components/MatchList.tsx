"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { relativeDate } from "@/lib/format";
import { scoreColor, SCORE_COLOR_CLASS } from "@/lib/types";

type GameEntry = {
  id: string;
  date: string;
  status: string;
  competition: string | null;
  friendly: boolean;
  homeTeam: { name: string; picture: string | null } | null;
  awayTeam: { name: string; picture: string | null } | null;
  homeScore: number | null;
  awayScore: number | null;
  so5Score: number | null;
  allAroundScore: number | null;
  minutesPlayed: number | null;
  goals: number | null;
  assists: number | null;
};

/**
 * Club pre-season friendlies, from our own Appearance table rather than
 * Sorare's game feed — Sorare's public API doesn't carry them at all. No So5
 * score exists for these, so the signal is minutes + decisive actions.
 */
type FriendlyEntry = {
  gameId: string;
  date: string;
  competition: string | null;
  minutes: number;
  started: boolean;
  goals: number | null;
  assists: number | null;
  rating: number | null;
};

/** Why the friendlies list is empty — see friendliesStatus in lib/services/friendlies.ts. */
type FriendliesStatus = "ok" | "not_configured" | "never_synced";

type PlayerDetail = {
  slug: string;
  pastGames: GameEntry[];
  futureGames: GameEntry[];
  friendlies?: FriendlyEntry[];
  friendliesStatus?: FriendliesStatus;
};

export type { GameEntry, FriendlyEntry, FriendliesStatus, PlayerDetail as MatchListDetail };

/**
 * The pre-season section used to disappear entirely when the list was empty,
 * which made "this integration was never set up" look identical to "this
 * player had no pre-season". Always rendering it, with the reason, is the
 * difference between a silent gap and something actionable.
 */
const FRIENDLIES_EMPTY: Record<FriendliesStatus, string> = {
  ok: "Aucun match de préparation pour ce joueur.",
  not_configured: "Clé API-Football absente — renseigne APIFOOTBALL_KEY pour voir les amicaux de club.",
  never_synced: "Jamais synchronisé — lance « Synchroniser les amicaux » dans l'onglet Données.",
};

function Row({ game }: { game: GameEntry }) {
  const played = game.minutesPlayed != null || game.so5Score != null;
  return (
    <li className="py-1.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs truncate">
            {game.homeTeam?.name ?? "?"} <span className="text-muted">vs</span> {game.awayTeam?.name ?? "?"}
            {game.friendly && (
              <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-line/50 text-muted font-mono align-middle">
                amical
              </span>
            )}
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
            <span className={`ml-2 font-bold ${game.so5Score > 0 ? SCORE_COLOR_CLASS[scoreColor(game.so5Score)] : "text-muted"}`}>
              {game.so5Score.toFixed(1)}
            </span>
          )}
          {game.status === "postponed" && <span className="text-warn ml-2">reporté</span>}
        </div>
      </div>
      {played && (
        <p className="text-[10px] font-mono text-muted mt-0.5 flex items-center gap-2">
          {game.minutesPlayed != null && <span>{game.minutesPlayed}&apos;</span>}
          {!!game.goals && <span className="text-ok">⚽ {game.goals}</span>}
          {!!game.assists && <span className="text-ok">🅰 {game.assists}</span>}
          {game.allAroundScore != null && <span title="Note all-around Sorare">AA {game.allAroundScore.toFixed(1)}</span>}
        </p>
      )}
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
  initialGames?: {
    pastGames: GameEntry[];
    futureGames: GameEntry[];
    friendlies?: FriendlyEntry[];
    friendliesStatus?: FriendliesStatus;
  };
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
      // A friendly fallback rather than the raw exception (often a GraphQL
      // "Player(slug=...) not found" that means nothing to a user).
      .catch(() => !cancelled && setError("Matchs indisponibles pour ce joueur pour le moment."));
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

      <div>
        <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">
          Matchs de préparation
        </p>
        {!detail.friendlies || detail.friendlies.length === 0 ? (
          <p className="font-mono text-xs text-muted">
            {FRIENDLIES_EMPTY[detail.friendliesStatus ?? "ok"]}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {detail.friendlies.map((f) => (
              <li key={f.gameId} className="py-1.5">
                <div className="flex items-center gap-2">
                  <p className="text-xs truncate flex-1">{f.competition ?? "Amical"}</p>
                  <span className="font-mono text-[11px] text-muted shrink-0">
                    {f.started ? "titulaire" : f.minutes > 0 ? "entré en jeu" : "non utilisé"}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-muted mt-0.5 flex items-center gap-2">
                  <span>{relativeDate(f.date)}</span>
                  <span>{f.minutes}&apos;</span>
                  {!!f.goals && <span className="text-ok">⚽ {f.goals}</span>}
                  {!!f.assists && <span className="text-ok">🅰 {f.assists}</span>}
                  {f.rating != null && <span title="Note API-Football (~1-10)">note {f.rating.toFixed(1)}</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
