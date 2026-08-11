"use client";

export type PlayerAlert = { kind: string; detail: string | null };

const ICON: Record<string, { icon: string; tone: "ok" | "warn"; label: string }> = {
  price_down: { icon: "📉", tone: "warn", label: "Baisse de prix" },
  price_up: { icon: "📈", tone: "ok", label: "Hausse de prix" },
  // Direction (good/bad for you) isn't auto-classified from the headline
  // alone — this just flags that transfer-flavoured news exists, worth a look.
  transfer_rumor: { icon: "📰", tone: "warn", label: "Rumeur de transfert" },
};

/** Small inline alert icons for a player row/card — see lib/services/alerts.ts. */
export default function AlertBadges({ alerts }: { alerts?: PlayerAlert[] }) {
  if (!alerts?.length) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {alerts.map((a) => {
        const meta = ICON[a.kind];
        if (!meta) return null;
        return (
          <span
            key={a.kind}
            title={`${meta.label}${a.detail ? ` · ${a.detail}` : ""}`}
            className={`text-xs ${meta.tone === "ok" ? "text-ok" : "text-warn"}`}
          >
            {meta.icon}
          </span>
        );
      })}
    </span>
  );
}
