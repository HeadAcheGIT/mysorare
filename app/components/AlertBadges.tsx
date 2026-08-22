"use client";

import { TRANSFER_STAGES } from "@/lib/services/transferStage";

export type PlayerAlert = {
  kind: string;
  detail: string | null;
  /** Transfer alerts only — see lib/services/transferStage.ts. */
  stage?: string | null;
  sourceCount?: number | null;
  sourceNames?: string | null;
  headlineUrl?: string | null;
  headlineTitle?: string | null;
  headlineDate?: string | null;
};

// Keyed as `string`, not `TransferStageId`: `stage` arrives as untyped JSON
// off the wire (via PlayerAlert), so the lookup itself is what has to
// validate it — an unrecognised value simply renders nothing.
const STAGE_META: Map<string, (typeof TRANSFER_STAGES)[number]> = new Map(TRANSFER_STAGES.map((s) => [s.id, s]));

const TONE_CLASS: Record<string, string> = {
  ok: "text-ok",
  warn: "text-warn",
  flood: "text-flood",
  muted: "text-muted",
};

const ICON: Record<string, { icon: string; tone: "ok" | "warn"; label: string }> = {
  price_down: { icon: "📉", tone: "warn", label: "Baisse de prix" },
  price_up: { icon: "📈", tone: "ok", label: "Hausse de prix" },
  // Distinct from price_up/price_down on purpose: those compare against the
  // previous daily snapshot, these against what the card actually cost.
  value_down: { icon: "🩸", tone: "warn", label: "Moins-value vs achat" },
  value_up: { icon: "💰", tone: "ok", label: "Plus-value vs achat" },
};

/**
 * How the corroboration count reads in a tooltip — the whole point of
 * cross-referencing outlets instead of trusting one, so it has to be visible
 * right where the alert is, not buried a click away.
 */
function corroborationText(sourceCount: number | null | undefined): string {
  if (!sourceCount) return "";
  if (sourceCount === 1) return " · 1 seule source — à vérifier";
  return ` · ${sourceCount} sources concordantes`;
}

/** Small inline alert icons for a player row/card — see lib/services/alerts.ts. */
export default function AlertBadges({ alerts }: { alerts?: PlayerAlert[] }) {
  if (!alerts?.length) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {alerts.map((a) => {
        if (a.kind === "transfer") {
          const meta = a.stage ? STAGE_META.get(a.stage) : undefined;
          if (!meta) return null;
          const title = `${meta.label}${corroborationText(a.sourceCount)}${
            a.headlineTitle ? ` · ${a.headlineTitle}` : ""
          }`;
          return (
            <span key="transfer" title={title} className={`text-xs ${TONE_CLASS[meta.tone]}`}>
              {meta.icon}
            </span>
          );
        }
        const meta = ICON[a.kind];
        if (!meta) return null;
        return (
          <span
            key={a.kind}
            title={`${meta.label}${a.detail ? ` · ${a.detail}` : ""}`}
            className={`text-xs ${TONE_CLASS[meta.tone]}`}
          >
            {meta.icon}
          </span>
        );
      })}
    </span>
  );
}
