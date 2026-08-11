/**
 * Compact form chart: recent So5 scores oldest → newest, so the eye reads
 * left-to-right as "how this player has been trending".
 *
 * Sorare scores sit on a 0-100 scale where ~50 is a solid outing, so the
 * baseline is drawn at 50 rather than at the series minimum — a flat line of
 * 20s and a flat line of 80s must not look identical.
 */
import { daysSince, isStale, isTrendingGood } from "@/lib/sparkline";

export default function Sparkline({
  scores,
  lastPlayedAt,
  width = 76,
  height = 24,
}: {
  scores: number[];
  /** ISO date of the most recent known appearance, if any — see SquadCard.lastPlayedAt. */
  lastPlayedAt?: string | null;
  width?: number;
  height?: number;
}) {
  if (isStale(lastPlayedAt)) {
    return (
      <span className="text-[10px] font-mono text-muted">
        inactif depuis {Math.floor(daysSince(lastPlayedAt as string))}j
      </span>
    );
  }

  if (scores.length < 2) {
    return <span className="text-[10px] font-mono text-muted">pas d&apos;historique</span>;
  }

  // Incoming order is newest-first; chart reads chronologically.
  const series = [...scores].reverse();
  const max = Math.max(60, ...series);
  const min = Math.min(0, ...series);
  const span = max - min || 1;

  const x = (i: number) => (i / (series.length - 1)) * (width - 2) + 1;
  const y = (v: number) => height - 1 - ((v - min) / span) * (height - 2);

  const path = series.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = series[series.length - 1];
  const good = isTrendingGood(series);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible shrink-0"
      role="img"
      aria-label={`Forme récente : ${series.map((s) => Math.round(s)).join(", ")}`}
    >
      <line
        x1={0}
        x2={width}
        y1={y(50)}
        y2={y(50)}
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="2 3"
        className="text-line"
      />
      <path
        d={path}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
        className={good ? "text-ok" : "text-warn"}
      />
      <circle cx={x(series.length - 1)} cy={y(last)} r={2} fill="currentColor" className={good ? "text-ok" : "text-warn"} />
    </svg>
  );
}
