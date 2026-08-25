"use client";

import type { ReactNode } from "react";
import MercatoBoard from "../MercatoBoard";
import type { PlayerAlert } from "../AlertBadges";
import type { MercatoSignalRow } from "@/lib/services/mercato";
import type { SquadCard } from "@/lib/types";

interface MercatoTabProps {
  squad: SquadCard[];
  alertsBySlug: Record<string, PlayerAlert[]>;
  coveredLeagues: Set<string>;
  signals: Record<string, MercatoSignalRow>;
  onSelectPlayer: (playerSlug: string, extra?: ReactNode) => void;
}


export default function MercatoTab({
  squad,
  alertsBySlug,
  coveredLeagues,
  signals,
  onSelectPlayer,
}: MercatoTabProps) {
  return (
    <section aria-label="Mercato">
      <MercatoBoard
        squad={squad}
        alertsBySlug={alertsBySlug}
        coveredLeagues={coveredLeagues}
        signals={signals}
        onSelectPlayer={onSelectPlayer}
      />
    </section>
  );
}
