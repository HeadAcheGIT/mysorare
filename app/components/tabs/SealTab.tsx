"use client";

import SealBoard from "../SealBoard";
import type { SquadCard } from "@/lib/types";

interface SealTabProps {
  squad: SquadCard[];
  coveredLeagues: Set<string>;
  onSelectPlayer: (playerSlug: string) => void;
  onToggled: (cardSlug: string, sealedAt: string | null) => void;
}

export default function SealTab({ squad, coveredLeagues, onSelectPlayer, onToggled }: SealTabProps) {
  return (
    <section aria-label="Coffre">
      <SealBoard squad={squad} coveredLeagues={coveredLeagues} onSelectPlayer={onSelectPlayer} onToggled={onToggled} />
    </section>
  );
}
