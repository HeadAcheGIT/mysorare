"use client";

import { useMemo, useState } from "react";
import { POSITION_SHORT, rarityOf, type SquadCard } from "@/lib/types";
import { buildSealAdvice, type SealRow } from "@/lib/sealAdvice";
import { apiFetch } from "@/lib/apiFetch";

/**
 * Coffre (Vault) tab: which cards are already sealed, which are dead weight
 * worth sealing for the reward boost (see lib/sealAdvice.ts for the exact
 * "no club / league not scored / long inactive" criteria), and everything
 * else worth keeping unsealed and available for line-ups.
 *
 * Sealing itself still happens on Sorare — this only tracks the decision
 * (Card.sealedAt, toggled here) since seal state isn't exposed by the API
 * this app syncs against. The toggle is for bookkeeping, not the real action.
 */
export default function SealBoard({
  squad,
  coveredLeagues,
  onSelectPlayer,
  onToggled,
}: {
  squad: SquadCard[];
  coveredLeagues: Set<string>;
  onSelectPlayer: (playerSlug: string) => void;
  onToggled: (cardSlug: string, sealedAt: string | null) => void;
}) {
  const { sealed, suggested, keep } = useMemo(() => buildSealAdvice(squad, coveredLeagues), [squad, coveredLeagues]);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [showKeep, setShowKeep] = useState(false);

  const bySc = (rows: SealRow[]) => {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.card.rarity] = (counts[r.card.rarity] ?? 0) + 1;
    return counts;
  };
  const sealedByRarity = bySc(sealed);

  async function toggle(card: SquadCard, seal: boolean) {
    setPending((p) => new Set(p).add(card.cardSlug));
    try {
      const res = await apiFetch<{ sealedAt: string | null }>("/api/cards/seal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardSlug: card.cardSlug, sealed: seal }),
      });
      onToggled(card.cardSlug, res.sealedAt);
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(card.cardSlug);
        return next;
      });
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Sceller une carte dans le Coffre Sorare booste tes gains de leaderboard, mais te prive de cette
        carte pendant deux semaines par rareté. Le bon calcul : sceller ce qui ne t'aurait servi à rien de
        toute façon — pas de club, championnat que Sorare ne note pas, ou inactif depuis longtemps.
      </p>

      <section className="rounded-lg bg-ink2 border border-line overflow-hidden">
        <div className="px-3 py-2.5 border-b border-line flex items-center justify-between">
          <span className="font-display uppercase text-base leading-none">🔒 Déjà scellées</span>
          <span className="font-mono text-xs text-muted">{sealed.length}</span>
        </div>
        {sealed.length === 0 ? (
          <p className="px-3 py-3 font-mono text-xs text-muted">
            Aucune carte marquée scellée pour l'instant — coche-les ici après les avoir scellées sur Sorare.
          </p>
        ) : (
          <>
            <p className="px-3 pt-2.5 font-mono text-[11px] text-muted">
              {Object.entries(sealedByRarity)
                .map(([r, n]) => `${n} ${r}`)
                .join(" · ")}
            </p>
            <SealList rows={sealed} sealed pending={pending} onToggle={toggle} onSelectPlayer={onSelectPlayer} />
          </>
        )}
      </section>

      <section className="rounded-lg bg-ink2 border border-line overflow-hidden">
        <div className="px-3 py-2.5 border-b border-line flex items-center justify-between">
          <span className="font-display uppercase text-base leading-none">💡 À sceller</span>
          <span className="font-mono text-xs text-muted">{suggested.length}</span>
        </div>
        {suggested.length === 0 ? (
          <p className="px-3 py-3 font-mono text-xs text-muted">
            Rien à sceller — tout ce que tu possèdes a encore une utilité potentielle en compo.
          </p>
        ) : (
          <SealList rows={suggested} sealed={false} pending={pending} onToggle={toggle} onSelectPlayer={onSelectPlayer} />
        )}
      </section>

      <section className="rounded-lg bg-ink2 border border-line overflow-hidden">
        <button
          type="button"
          onClick={() => setShowKeep((v) => !v)}
          aria-expanded={showKeep}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
        >
          <span className="font-display uppercase text-base leading-none">✅ À garder disponibles</span>
          <span className="font-mono text-xs text-muted ml-auto">{keep.length}</span>
          <span className={`text-muted shrink-0 transition-transform ${showKeep ? "rotate-180" : ""}`} aria-hidden>
            ▾
          </span>
        </button>
        {showKeep && (
          <p className="px-3 pb-3 font-mono text-[11px] text-muted">
            Le reste de la galerie ({keep.length} carte{keep.length > 1 ? "s" : ""}) — encore une utilité en
            compo, ne pas sceller tant que ça reste vrai.
          </p>
        )}
      </section>
    </div>
  );
}

function SealList({
  rows,
  sealed,
  pending,
  onToggle,
  onSelectPlayer,
}: {
  rows: SealRow[];
  sealed: boolean;
  pending: Set<string>;
  onToggle: (card: SquadCard, seal: boolean) => void;
  onSelectPlayer: (playerSlug: string) => void;
}) {
  return (
    <ul className="divide-y divide-line">
      {rows.map(({ card, reasons }) => (
        <li key={card.cardSlug} className="px-3 py-2.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSelectPlayer(card.playerSlug)}
              className="flex-1 min-w-0 text-left flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-flood focus-visible:ring-inset rounded"
            >
              {card.picture ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
                <img
                  src={card.picture}
                  alt=""
                  loading="lazy"
                  className="w-9 h-9 rounded-full object-cover bg-ink shrink-0"
                />
              ) : (
                <span className="w-9 h-9 rounded-full bg-ink shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm truncate">
                  {card.name}{" "}
                  <span className={`text-[10px] ${rarityOf(card.rarity).text}`}>{rarityOf(card.rarity).label}</span>
                </p>
                <p className="text-[11px] text-muted truncate">
                  {POSITION_SHORT[card.position] ?? card.position}
                  {card.club ? ` · ${card.club}` : ""}
                </p>
              </div>
            </button>
            <button
              type="button"
              disabled={pending.has(card.cardSlug)}
              onClick={() => onToggle(card, !sealed)}
              className={`shrink-0 px-2.5 py-1.5 rounded-md text-xs font-mono border whitespace-nowrap disabled:opacity-50 ${
                sealed ? "border-warn text-warn" : "border-flood text-flood"
              }`}
            >
              {pending.has(card.cardSlug) ? "…" : sealed ? "Desceller" : "Marquer scellée"}
            </button>
          </div>
          {reasons.length > 0 && (
            <ul className="mt-1.5 pl-12 space-y-1">
              {reasons.map((r) => (
                <li key={r.code} className="font-mono text-[11px]">
                  <span className="font-bold">{r.label}</span> — <span className="text-muted">{r.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
