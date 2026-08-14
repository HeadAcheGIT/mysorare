"use client";

export type PStartBasis = "starts" | "appearances" | "baseline" | null;

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/**
 * How the label is chosen, and why it matters:
 *
 * "titu" is only honest when the number came from real starting-XI history.
 * When all we have is appearance counts, the number answers "does he play at
 * all" — a one-minute substitute scores the same as a 90-minute starter — so
 * it is labelled "joue" instead. Calling both "titulaire" is precisely what
 * made these figures untrustworthy.
 */
const LABEL: Record<Exclude<PStartBasis, null>, { short: string; long: string; title: string }> = {
  starts: {
    short: "titu",
    long: "Titulaire",
    title: "Probabilité d'être dans le onze de départ, calculée sur les compositions réelles des derniers matchs.",
  },
  appearances: {
    short: "joue",
    long: "Joue",
    title:
      "Probabilité d'entrer en jeu, titulaire ou remplaçant — le détail par match n'a pas encore été synchronisé, donc la titularisation n'est pas connue. Lance « Synchroniser la forme » dans Données.",
  },
  baseline: {
    short: "est.",
    long: "Estimation",
    title: "Aucun historique : estimation basée uniquement sur le poste.",
  },
};

export function startLabel(basis: PStartBasis, long = false): string {
  const entry = LABEL[basis ?? "baseline"];
  return long ? entry.long : entry.short;
}

/**
 * One line showing our probability next to Sorare's, so they can be compared
 * at a glance. Sorare's own figure is only published by its data partner for
 * some fixtures; when it isn't, that is stated rather than shown as a dash
 * the reader has to interpret.
 */
export default function StartProbability({
  pStart,
  basis,
  sorareOdds,
  compact = false,
}: {
  pStart: number | null;
  basis: PStartBasis;
  sorareOdds?: number | null;
  compact?: boolean;
}) {
  const entry = LABEL[basis ?? "baseline"];
  const diverges = pStart != null && sorareOdds != null && Math.abs(pStart - sorareOdds) >= 0.2;

  if (compact) {
    return (
      <span className="font-mono text-[11px] text-muted" title={entry.title}>
        {entry.short} {pct(pStart)}
        {sorareOdds != null && (
          <>
            {" · "}
            <span className={diverges ? "text-warn" : "text-muted"} title="Probabilité publiée par Sorare">
              Sorare {pct(sorareOdds)}
            </span>
          </>
        )}
      </span>
    );
  }

  return (
    <div className="bg-ink rounded-md px-3 py-2">
      <p className="text-[10px] font-mono uppercase tracking-wide text-muted" title={entry.title}>
        {entry.long}
      </p>
      <p className="font-display text-xl leading-tight">{pct(pStart)}</p>
      <p className="text-[10px] font-mono text-muted mt-0.5">
        {sorareOdds != null ? (
          <span className={diverges ? "text-warn" : undefined}>
            Sorare {pct(sorareOdds)}
            {diverges && " · écart"}
          </span>
        ) : (
          "Sorare n'a pas publié de cote"
        )}
      </p>
    </div>
  );
}
