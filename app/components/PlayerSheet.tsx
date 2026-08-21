"use client";

import { useEffect } from "react";
import Sparkline from "./Sparkline";
import MatchList from "./MatchList";
import PlayerNews from "./PlayerNews";
import PlayerBadges from "./PlayerBadges";
import StartProbability from "./StartProbability";
import { cardValue, POSITION_LABEL, rarityOf, scoreColor, SCORE_COLOR_CLASS, type SquadCard } from "@/lib/types";

const one = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const eur = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2)} €`);

/** Sorare's transfer types, in the manager's language. */
const ACQUISITION_LABEL: Record<string, string> = {
  ENGLISH_AUCTION: "Gagnée aux enchères",
  BUNDLED_ENGLISH_AUCTION: "Gagnée aux enchères (lot)",
  INSTANT_BUY: "Achat immédiat",
  SINGLE_SALE_OFFER: "Achetée en vente directe",
  SINGLE_BUY_OFFER: "Achetée sur offre",
  DIRECT_OFFER: "Reçue en échange",
  REWARD: "Gagnée en récompense",
  PACK: "Issue d'un pack",
  MINT: "Carte d'origine",
  REFERRAL: "Parrainage",
  SHARDS: "Échangée contre des shards",
  TRANSFER: "Transférée",
  DEPOSIT: "Déposée",
  LOAN: "Prêtée",
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "neutral" }) {
  return (
    <div className="bg-ink rounded-md px-3 py-2">
      <p className="text-[10px] font-mono uppercase tracking-wide text-muted">{label}</p>
      <p className={`font-display text-xl leading-tight ${tone ? SCORE_COLOR_CLASS[tone] : ""}`}>
        {value}
      </p>
    </div>
  );
}

/** Bottom sheet with the full detail for one card. */
export default function PlayerSheet({ card, onClose }: { card: SquadCard; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Stop the list behind the sheet from scrolling with it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const rarity = rarityOf(card.rarity);
  const isUnique = card.rarity === "unique";
  // An in-season card is only comparable to other in-season cards.
  const floor = (card.inSeason ? card.floorInSeason : null) ?? card.floorPrice;
  const val = card.valuation ?? null;
  // Profit against completed sales when they exist, and only against the CSV
  // export otherwise. The export's figures are a snapshot from whenever it was
  // taken and its floor is any-season, which is how a card bought at 4,87 €
  // and trading near 5 € came to show a 93 % loss.
  const reference = cardValue(card);
  const profit = reference != null && card.boughtPrice != null ? reference - card.boughtPrice : null;
  const profitSource = val?.value != null ? "ventes conclues" : card.price != null ? "prix CSV" : "floor CSV";
  const composition = card.priceComposition ?? null;
  // Return measured against the cash that actually left, not the sticker price.
  const cashProfit =
    reference != null && composition != null ? reference - composition.wallet : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={card.name}
        className="relative w-full sm:max-w-md bg-ink2 border-t sm:border border-line sm:rounded-xl rounded-t-2xl max-h-[85vh] overflow-y-auto safe-bottom"
      >
        <div
          className={`flex items-center gap-3 p-4 border-b border-b-line border-l-[3px] ${
            isUnique ? "border-l-transparent rarity-unique-edge" : rarity.border
          }`}
        >
          {card.picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
            <img src={card.picture} alt="" className="w-16 h-16 rounded-full object-cover bg-ink shrink-0" />
          ) : (
            <span className="w-16 h-16 rounded-full bg-ink shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl uppercase leading-none truncate">{card.name}</h2>
            <p className="text-xs text-muted truncate mt-1">
              {POSITION_LABEL[card.position] ?? card.position}
              {card.age != null && ` · ${card.age} ans`}
              {card.shirtNumber != null && ` · n°${card.shirtNumber}`}
            </p>
            <p className="text-xs text-muted truncate flex items-center gap-1.5 mt-0.5">
              {card.clubPicture && (
                // eslint-disable-next-line @next/next/no-img-element -- remote Sorare CDN
                <img src={card.clubPicture} alt="" className="w-4 h-4 object-contain" />
              )}
              {card.club ?? "sans club"}
            </p>
            <p className="flex items-center gap-1.5 mt-1 flex-wrap">
              <PlayerBadges birthDate={card.birthDate} competitionName={card.competitionName} />
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 w-8 h-8 grid place-items-center rounded-md border border-line text-muted"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {(card.injury || card.suspended) && (
            <p className="text-sm text-warn bg-warn/10 border border-warn/40 rounded-md px-3 py-2">
              {card.suspended ? "Suspendu" : `Blessé — ${card.injury}`}
            </p>
          )}

          <div>
            <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">Forme récente</p>
            <div className="flex items-center gap-3 bg-ink rounded-md px-3 py-2">
              <Sparkline scores={card.recentScores} lastPlayedAt={card.lastPlayedAt} width={140} height={34} />
              <span className="font-mono text-xs text-muted">
                {card.recentScores.length ? `${card.recentScores.length} matchs` : "—"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Projeté" value={one(card.expected)} tone={scoreColor(card.expected)} />
            <Stat label="Sorare" value={one(card.sorareProjection)} tone={scoreColor(card.sorareProjection)} />
            <Stat label="L10" value={one(card.l10)} tone={scoreColor(card.l10)} />
            <StartProbability
              pStart={card.pStart}
              basis={card.pStartBasis}
              sorareOdds={card.sorareStarterOdds}
            />
            <Stat label="L5" value={one(card.l5)} tone={scoreColor(card.l5)} />
            <Stat label="L15" value={one(card.l15)} tone={scoreColor(card.l15)} />
          </div>

          {/* Only worth showing next to the starting probability, and only when
              the two actually differ — for a nailed-on starter they're the
              same number and the extra line is noise. */}
          {/* The model already explains itself — thin sample, injury, fixture
              difficulty, Sorare's projection blended in — but nothing rendered
              it, so none of that reasoning was checkable. */}
          {card.note && (
            <p className="font-mono text-[11px] text-muted bg-ink rounded-md px-3 py-2">
              {card.note}
            </p>
          )}

          {card.pPlay != null && card.pStart != null && card.pPlay - card.pStart >= 0.1 && (
            <p className="font-mono text-[11px] text-muted">
              Entre en jeu {Math.round(card.pPlay * 100)}% du temps, titulaire{" "}
              {Math.round(card.pStart * 100)}% — souvent utilisé en remplaçant.
            </p>
          )}

          <div>
            <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">Marché</p>
            <div className="grid grid-cols-2 gap-2">
              {/* Completed sales lead, because they're the only figure here
                  that reflects what someone actually paid. */}
              <Stat label="Valorisation" value={eur(val?.value)} />
              <Stat label="Acheté" value={eur(card.boughtPrice)} />
            </div>

            {val?.value != null ? (
              <p className="mt-1 font-mono text-[11px] text-muted">
                {val.sampleSize} vente{val.sampleSize > 1 ? "s" : ""}
                {val.windowDays != null && ` sur ${val.windowDays} j`}
                {val.low != null && val.high != null && ` · de ${eur(val.low)} à ${eur(val.high)}`}
                {card.inSeason ? " · marché in-season" : " · marché toutes saisons"}
              </p>
            ) : (
              <p className="mt-1 font-mono text-[11px] text-muted">
                {val
                  ? "Aucune vente conclue sur ce marché — rien à quoi comparer."
                  : "Pas encore valorisée. Lance « Tout synchroniser » depuis l'onglet Données."}
              </p>
            )}

            {/* A number can be precise and still not worth trusting. Both of
                these say so out loud rather than letting a confident-looking
                figure carry a decision it can't support. */}
            {val?.thin && (
              <p className="mt-1 font-mono text-[11px] text-warn">
                Échantillon trop maigre ou trop ancien — à prendre comme un ordre de grandeur.
              </p>
            )}
            {val?.launchPremium && (
              <p className="mt-1 font-mono text-[11px] text-limited">
                Sortie récente : les premières séries partent bien au-dessus du niveau réel, le prix
                n&apos;est pas encore stabilisé.
              </p>
            )}
            {val?.trendPct != null && Math.abs(val.trendPct) >= 5 && (
              <p className={`mt-1 font-mono text-[11px] ${val.trendPct > 0 ? "text-ok" : "text-warn"}`}>
                Tendance {val.trendPct > 0 ? "+" : ""}
                {val.trendPct.toFixed(0)} % sur la fenêtre
              </p>
            )}

            {/* Kept, but demoted: these come from the SorareScore export and
                are only as fresh as the last import. */}
            <div className="grid grid-cols-3 gap-2 mt-2">
              <Stat label={card.inSeason ? "Floor IS" : "Floor"} value={eur(floor)} />
              <Stat label="Prix CSV" value={eur(card.price)} />
              <Stat label="Estimé" value={eur(card.estimatedPrice)} />
            </div>

            {/* For an in-season card the any-season floor is usually an old
                season trading for cents — showing it alone made a card worth
                €15 look worth €0.33. */}
            {card.inSeason && card.floorInSeason != null && card.floorPrice != null && (
              <p className="mt-1 font-mono text-[11px] text-muted">
                Floor toutes saisons {eur(card.floorPrice)} — non comparable, c&apos;est une carte d&apos;une
                saison antérieure.
              </p>
            )}

            {(card.acquiredVia || card.paidWithCredits || card.boughtPriceApprox) && (
              <p className="mt-1 font-mono text-[11px] text-muted">
                {card.acquiredVia && ACQUISITION_LABEL[card.acquiredVia]}
                {card.paidWithCredits && " · réglé en crédits"}
                {card.boughtPriceApprox && " · prix converti depuis l'ETH (≈)"}
              </p>
            )}

            {/* What the purchase was actually made of. The price and the cash
                that left the wallet differ whenever credits were involved, and
                only the cash half is money you will not get back. */}
            {composition && (
              <p className="mt-1 font-mono text-[11px]">
                {composition.credit > 0 ? (
                  <>
                    <span className="text-muted">dont </span>
                    <span className="text-fg">{eur(composition.wallet)} portefeuille</span>
                    <span className="text-muted"> + </span>
                    <span className="text-limited">{eur(composition.credit)} crédits</span>
                    <span className="text-muted"> ({composition.creditPct} %)</span>
                  </>
                ) : (
                  <span className="text-muted">payé intégralement en cash ({eur(composition.wallet)})</span>
                )}
              </p>
            )}

            {profit != null && (
              <p className={`mt-2 font-mono text-sm ${profit >= 0 ? "text-ok" : "text-warn"}`}>
                {profit >= 0 ? "+" : ""}
                {profit.toFixed(2)} € depuis l&apos;achat{" "}
                <span className="text-muted text-[11px]">(vs {profitSource})</span>
              </p>
            )}

            {/* The cash view of the same card. A card half-paid in credits has
                a better return on money actually spent than the headline says,
                and that is the number a ROI decision rests on. */}
            {cashProfit != null && composition != null && composition.credit > 0 && (
              <p className={`font-mono text-[11px] ${cashProfit >= 0 ? "text-ok" : "text-warn"}`}>
                {cashProfit >= 0 ? "+" : ""}
                {cashProfit.toFixed(2)} € sur le cash réellement sorti ({eur(composition.wallet)})
              </p>
            )}
          </div>

          <p className="font-mono text-[11px] text-muted">
            {rarity.label}
            {card.season != null && ` · saison ${card.season}`}
            {card.serial != null && ` · n° de série ${card.serial}`}
            {card.inSeason && " · in-season"}
          </p>

          <div>
            <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">Matchs</p>
            <div className="bg-ink rounded-md px-3 py-2">
              <MatchList slug={card.playerSlug} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">Actualités</p>
            <div className="bg-ink rounded-md px-3 py-2">
              <PlayerNews name={card.name} />
            </div>
          </div>

          <a
            href={`https://sorare.com/football/players/${card.playerSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-sm border border-line rounded-md py-2 text-muted"
          >
            Voir sur Sorare ↗
          </a>
        </div>
      </div>
    </div>
  );
}
