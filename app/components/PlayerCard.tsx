"use client";

import Sparkline from "./Sparkline";
import AlertBadges, { type PlayerAlert } from "./AlertBadges";
import PlayerBadges from "./PlayerBadges";
import { POSITION_SHORT, rarityOf, scoreColor, SCORE_COLOR_CLASS, type SquadCard } from "@/lib/types";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const one = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const eur = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)} €`);

/**
 * One card in the gallery. The rarity is carried by a left edge rather than a
 * badge so a long list stays scannable by colour alone, and the strongest
 * available score sits far right at a fixed position for the same reason.
 */
export default function PlayerCard({
  card,
  onSelect,
  coveredLeagues,
  alerts,
}: {
  card: SquadCard;
  onSelect?: (card: SquadCard) => void;
  /** Slugs of leagues the scouting tab can actually search — see /api/scouting. */
  coveredLeagues?: Set<string>;
  alerts?: PlayerAlert[];
}) {
  const rarity = rarityOf(card.rarity);
  // Our own projection when it exists, else Sorare's, else the CSV average —
  // labelled so the number is never mistaken for something it isn't.
  const score = card.expected ?? card.sorareProjection ?? card.l10;
  const scoreLabel = card.expected != null ? "projeté" : card.sorareProjection != null ? "Sorare" : "L10";
  const unavailable = Boolean(card.injury || card.suspended);
  const covered = card.competitionSlug ? coveredLeagues?.has(card.competitionSlug) : undefined;
  const isUnique = card.rarity === "unique";

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
            {card.serial != null && <span className="text-muted/70"> · #{card.serial}</span>}
          </p>

          {/* Second-tier signals — eligibility and division. Kept off the name
              row on purpose (see PlayerCard audit note H-2): a long real name
              was losing the truncation fight against 3+ badges. */}
          <p className="flex items-center gap-1.5 mt-1 flex-wrap">
            <PlayerBadges
              birthDate={card.birthDate}
              competitionName={card.competitionName}
              inSeason={card.inSeason}
              unavailable={unavailable}
              covered={covered}
              engagedInLineup={card.engagedInLineup}
            />
          </p>

          <div className="flex items-center gap-3 mt-1.5">
            <Sparkline scores={card.recentScores} lastPlayedAt={card.lastPlayedAt} />
            <span className="font-mono text-[11px] text-muted">
              {card.pStart != null ? `titu ${pct(card.pStart)}` : eur(card.floorPrice)}
            </span>
          </div>
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
