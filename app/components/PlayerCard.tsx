"use client";

import Sparkline from "./Sparkline";
import AlertBadges, { type PlayerAlert } from "./AlertBadges";
import StartProbability from "./StartProbability";
import { POSITION_SHORT, cardValue, rarityOf, scoreColor, SCORE_COLOR_CLASS, type SquadCard } from "@/lib/types";
import { ordinalFr } from "@/lib/format";

const one = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const eur = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)} €`);

/**
 * Short French kick-off, e.g. "sam. 23/08 20:45".
 *
 * Weekday included on purpose: a Sorare game week straddles several days, and
 * "which day does he play" is the question a date alone doesn't answer at a
 * glance.
 */
function kickoff(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d
    .toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .replace(",", "");
}

/**
 * One card in the gallery. The rarity is carried by a left edge rather than a
 * badge so a long list stays scannable by colour alone, and the strongest
 * available score sits far right at a fixed position for the same reason.
 */
export default function PlayerCard({
  card,
  onSelect,
  alerts,
}: {
  card: SquadCard;
  onSelect?: (card: SquadCard) => void;
  alerts?: PlayerAlert[];
}) {
  const rarity = rarityOf(card.rarity);
  // Our own projection when it exists, else Sorare's, else the CSV average —
  // labelled so the number is never mistaken for something it isn't.
  const score = card.expected ?? card.sorareProjection ?? card.l10;
  const scoreLabel = card.expected != null ? "projeté" : card.sorareProjection != null ? "Sorare" : "L10";
  const unavailable = Boolean(card.injury || card.suspended);
  const isUnique = card.rarity === "unique";
  // Same order of trust as everywhere else — completed sales, then the CSV.
  const value = cardValue(card);
  const when = kickoff(card.nextGame?.date ?? null);

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(card)}
        className={`w-full text-left flex items-center gap-3 p-3 rounded-lg bg-ink2 border-t border-r border-b border-t-line border-r-line border-b-line border-l-[3px] transition-colors hover:bg-line/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-flood ${
          isUnique ? "border-l-transparent rarity-unique-edge" : rarity.border
        }`}
      >
        <div className="relative shrink-0">
          {card.picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN; the Next optimiser would burn Vercel's image quota for no gain at this size
            <img
              src={card.picture}
              alt=""
              loading="lazy"
              className="w-12 h-12 rounded-full object-cover bg-ink"
            />
          ) : (
            <span className="w-12 h-12 rounded-full bg-ink grid place-items-center font-display text-sm text-muted">
              {POSITION_SHORT[card.position] ?? "?"}
            </span>
          )}
          {card.clubPicture && (
            // eslint-disable-next-line @next/next/no-img-element -- see above
            <img
              src={card.clubPicture}
              alt=""
              loading="lazy"
              className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-ink2 ring-2 ring-ink2 object-contain"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold truncate">{card.name}</span>
            <AlertBadges alerts={alerts} />
            {unavailable && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-warn/15 text-warn font-mono">
                {card.suspended ? "suspendu" : "blessé"}
              </span>
            )}
          </div>

          <p className="text-xs text-muted truncate">
            <span className={`font-mono ${rarity.text}`}>{POSITION_SHORT[card.position] ?? card.position}</span>
            {" · "}
            {card.club ?? "sans club"}
          </p>

          {/* Probability and value together, not one or the other: the old
              card showed the price only when no probability existed, so a
              player you could field never displayed what he was worth. */}
          <div className="flex items-center gap-3 mt-1.5">
            <Sparkline scores={card.recentScores} lastPlayedAt={card.lastPlayedAt} />
            {card.pStart != null && (
              <StartProbability
                compact
                pStart={card.pStart}
                basis={card.pStartBasis}
                sorareOdds={card.sorareStarterOdds}
              />
            )}
            <span className="font-mono text-[11px] text-muted">{eur(value)}</span>
          </div>

          {/* The match the projection is actually about. A starting
              probability with no opponent and no date is a number without its
              question. */}
          <p className="font-mono text-[11px] text-muted mt-1 truncate">
            {card.nextGame ? (
              <>
                {when && <span className="text-fg/80">{when}</span>}
                {when && " · "}
                <span title={card.nextGame.isHome ? "à domicile" : "à l'extérieur"}>
                  {card.nextGame.isHome ? "reçoit" : "va à"}
                </span>{" "}
                {card.nextGame.opponentName}
                {card.nextGame.opponentRank != null && (
                  <span className="text-muted/70"> ({ordinalFr(card.nextGame.opponentRank)})</span>
                )}
              </>
            ) : (
              <span className="text-muted/60">Pas de match cette game week</span>
            )}
          </p>
        </div>

        <div className="text-right shrink-0 w-14">
          <span className={`font-display text-2xl font-bold leading-none block ${SCORE_COLOR_CLASS[scoreColor(score)]}`}>
            {one(score)}
          </span>
          <span className="block text-[10px] font-mono text-muted">{scoreLabel}</span>
        </div>
      </button>
    </li>
  );
}
