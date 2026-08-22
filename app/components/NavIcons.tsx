/**
 * Minimal inline icons for the bottom nav — hand-rolled rather than a new
 * dependency, matching the rest of the app. `currentColor` so the existing
 * active/inactive text colour classes on the tab button drive them for free.
 */
const common = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function WeekIcon() {
  return (
    <svg {...common}>
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M3 8h14M7 2.5v3M13 2.5v3" />
    </svg>
  );
}

export function GalleryIcon() {
  return (
    <svg {...common}>
      <rect x="5" y="3" width="11" height="14" rx="2" />
      <path d="M5 6.5H2.5v10a1.5 1.5 0 0 0 1.5 1.5h10" />
    </svg>
  );
}

export function LineupIcon() {
  return (
    <svg {...common}>
      <rect x="2.5" y="3" width="15" height="14" rx="1.5" />
      <path d="M2.5 10h15M10 3v14" />
      <circle cx="10" cy="10" r="2.2" />
    </svg>
  );
}

export function MercatoIcon() {
  return (
    <svg {...common}>
      <path d="M3 6.5h10.5M13.5 6.5 10.5 3.5M13.5 6.5 10.5 9.5" />
      <path d="M17 13.5H6.5M6.5 13.5l3-3M6.5 13.5l3 3" />
    </svg>
  );
}

export function MarketIcon() {
  return (
    <svg {...common}>
      <path d="M3 3.5h3.2l1 9.5a1.5 1.5 0 0 0 1.5 1.35h6a1.5 1.5 0 0 0 1.48-1.25l1.02-6.1H6.6" />
      <circle cx="8.5" cy="17" r="1.1" />
      <circle cx="14.5" cy="17" r="1.1" />
    </svg>
  );
}

export function HistoryIcon() {
  return (
    <svg {...common}>
      <circle cx="10" cy="10.5" r="7" />
      <path d="M10 6.5v4l3 2" />
      <path d="M4 3.5L3.3 6l2.5-.5" />
    </svg>
  );
}

export function DataIcon() {
  return (
    <svg {...common}>
      <path d="M4 5h9M4 10h12M4 15h7" />
      <circle cx="15" cy="5" r="1.6" />
      <circle cx="8" cy="10" r="1.6" />
      <circle cx="13" cy="15" r="1.6" />
    </svg>
  );
}
