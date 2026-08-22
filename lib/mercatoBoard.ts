import type { SquadCard } from "./types";
import { TRANSFER_STAGES, type TransferStageId } from "./services/transferStage";
import type { MercatoSignalRow } from "./services/mercato";
import type { PlayerAlert } from "@/app/components/AlertBadges";

/**
 * Combines everything the Mercato tab knows about a player into two ranked
 * lists — "à risque" and "bonnes nouvelles" — from data the app already has
 * in the browser by the time this runs: the squad, the transfer alerts (see
 * lib/services/alerts.ts), the two situational trends (see
 * lib/services/mercato.ts), and which leagues market scouting can actually
 * search (see /api/scouting, already loaded for the gallery's badges).
 *
 * Pure and client-safe on purpose — the league-coverage check reuses the
 * `coveredLeagues` set the app already fetches once on load rather than
 * asking the server to call Sorare's live leagues endpoint a second time.
 */

export type MercatoReasonCode = "transfer" | "start_down" | "start_up" | "form_up" | "league_uncovered";

export interface MercatoReason {
  code: MercatoReasonCode;
  label: string;
  detail: string;
  /** Higher = more worth looking at first, within its own list. */
  weight: number;
}

export interface MercatoItem {
  card: SquadCard;
  reasons: MercatoReason[];
  /** The live transfer story, if any — carried through for the headline link. */
  transfer: PlayerAlert | null;
  score: number;
}

const STAGE_META = new Map(TRANSFER_STAGES.map((s) => [s.id, s]));
const STAGE_RANK = new Map(TRANSFER_STAGES.map((s) => [s.id, s.rank]));

function transferReason(alert: PlayerAlert): MercatoReason {
  const meta = STAGE_META.get((alert.stage ?? "") as TransferStageId);
  const rank = STAGE_RANK.get((alert.stage ?? "") as TransferStageId) ?? 1;
  const corroborated = (alert.sourceCount ?? 0) > 1;
  return {
    code: "transfer",
    label: meta ? `${meta.icon} ${meta.label}` : "Transfert en cours",
    detail: corroborated
      ? `${alert.sourceCount} sources concordantes`
      : alert.sourceCount === 1
        ? "1 seule source — à vérifier"
        : "",
    weight: rank * 10,
  };
}

/**
 * One player, deduped across every card owned of them (a second copy of the
 * same player must not double the section), with every applicable reason —
 * a player can legitimately show up with both a risk and an opportunity
 * reason at once (e.g. mid-transfer *and* trending up), so this returns one
 * row per list, not one row overall.
 */
export function buildMercatoLists(
  squad: SquadCard[],
  alertsBySlug: Record<string, PlayerAlert[]>,
  coveredLeagues: Set<string>,
  signalsBySlug: Record<string, MercatoSignalRow>
): { risks: MercatoItem[]; opportunities: MercatoItem[] } {
  const seen = new Set<string>();
  const risks: MercatoItem[] = [];
  const opportunities: MercatoItem[] = [];

  for (const card of squad) {
    if (seen.has(card.playerSlug)) continue;
    seen.add(card.playerSlug);

    const transfer = (alertsBySlug[card.playerSlug] ?? []).find((a) => a.kind === "transfer" && a.stage) ?? null;
    const signal = signalsBySlug[card.playerSlug];

    const riskReasons: MercatoReason[] = [];
    const oppReasons: MercatoReason[] = [];

    if (transfer) riskReasons.push(transferReason(transfer));

    if (signal?.startTrend?.direction === "down") {
      riskReasons.push({
        code: "start_down",
        label: "📉 Moins titulaire",
        detail: `${signal.startTrend.priorPct}% → ${signal.startTrend.recentPct}% de titularisation, selon notre modèle`,
        weight: signal.startTrend.delta * 100,
      });
    }
    if (signal?.startTrend?.direction === "up") {
      oppReasons.push({
        code: "start_up",
        label: "📈 Plus titulaire",
        detail: `${signal.startTrend.priorPct}% → ${signal.startTrend.recentPct}% de titularisation, selon notre modèle`,
        weight: signal.startTrend.delta * 100,
      });
    }
    if (signal?.formTrend) {
      oppReasons.push({
        code: "form_up",
        label: "⤴️ Forme en hausse",
        detail: `+${signal.formTrend.delta} pts sur les derniers matchs`,
        weight: signal.formTrend.delta,
      });
    }

    // Only meaningful once the league list has actually loaded — an empty
    // set (fetch failed, or not loaded yet) must never read as "nothing is
    // covered", which would flag every single player.
    if (
      coveredLeagues.size > 0 &&
      card.competitionSlug &&
      !coveredLeagues.has(card.competitionSlug)
    ) {
      riskReasons.push({
        code: "league_uncovered",
        label: "🌍 Championnat non couvert",
        detail: `${card.competitionName ?? card.competitionSlug} — hors du scouting marché Cockpit`,
        weight: 15,
      });
    }

    if (riskReasons.length) {
      risks.push({
        card,
        reasons: riskReasons,
        transfer,
        score: riskReasons.reduce((s, r) => s + r.weight, 0),
      });
    }
    if (oppReasons.length) {
      opportunities.push({
        card,
        reasons: oppReasons,
        transfer,
        score: oppReasons.reduce((s, r) => s + r.weight, 0),
      });
    }
  }

  risks.sort((a, b) => b.score - a.score);
  opportunities.sort((a, b) => b.score - a.score);
  return { risks, opportunities };
}
