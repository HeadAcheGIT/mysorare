"use client";

import { u23Status } from "@/lib/types";

/**
 * U23 + in-season + championship badges — the "player preview" cluster shown
 * next to a name wherever a player appears. Each piece is opt-in: a bare
 * player with no owned card behind it (PlayerPopup, InsightList, watchlist,
 * market search) has no in-season eligibility to show, so `inSeason` is
 * simply omitted there and only U23 + championship render.
 */
export default function PlayerBadges({
  birthDate,
  competitionName,
  inSeason,
  unavailable,
  covered,
}: {
  birthDate: string | null;
  competitionName?: string | null;
  /** Card-level in-season eligibility — omit entirely to skip the IS/CL toggle. */
  inSeason?: boolean;
  unavailable?: boolean;
  /** Whether competitionName is covered by market scouting — undefined skips the warning styling. */
  covered?: boolean;
}) {
  const u23 = u23Status(birthDate);

  return (
    <>
      {inSeason !== undefined && !unavailable && (
        inSeason ? (
          <span
            className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-ok/15 text-ok font-mono"
            title="Éligible in-season"
          >
            IS
          </span>
        ) : (
          <span
            className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-line/50 text-muted font-mono"
            title="Classic uniquement"
          >
            CL
          </span>
        )
      )}
      {u23?.eligible && (
        <span
          className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-flood/15 text-flood font-mono"
          title={`U23 · éligible jusqu'au ${u23.validUntil.toLocaleDateString("fr-FR")}`}
        >
          U23
        </span>
      )}
      {competitionName && (
        <span
          className={`text-[10px] font-mono truncate ${covered === false ? "text-warn" : "text-muted"}`}
          title={covered === false ? "Championnat non couvert par le scouting marché" : undefined}
        >
          {competitionName}
          {covered === false && " · non couvert"}
        </span>
      )}
    </>
  );
}
