import type { Config } from "tailwindcss";

export default {
  // `lib/**` matters as much as `app/**` here: RARITY_CLASS and
  // SCORE_COLOR_CLASS in lib/types.ts hold class names like "border-rare" as
  // plain string values, and Tailwind's JIT scanner only generates a utility
  // class if it finds that exact literal somewhere in a scanned file. Without
  // this, any class that's *only* ever referenced dynamically (never spelled
  // out inside app/**) silently never gets generated — the DOM shows the
  // class name, but no CSS rule exists for it, so it falls back to whatever
  // else sets the same property. That's exactly what was happening to Common,
  // Rare and Super Rare borders/text before this line was added.
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14121F",
        ink2: "#1D1A2C",
        line: "#2E2A40",
        flood: "#F2C14E",
        muted: "#918CA6",
        ok: "#4FB286",
        warn: "#D2483F",
        common: "#7D8598",
        limited: "#E0A73B",
        // Turquoise/magenta, matching Sorare's own rarity colours rather than
        // the app's semantic red/blue — `rare` used to be byte-identical to
        // `warn`, so a Rare card's border read as an injury/suspension alert.
        // Both pass 4.5:1 contrast (WCAG AA) against the ink2 card surface.
        rare: "#3FC5D6",
        superrare: "#E85DC2",
      },
      fontFamily: {
        display: ["Barlow Condensed", "sans-serif"],
        body: ["Archivo", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
