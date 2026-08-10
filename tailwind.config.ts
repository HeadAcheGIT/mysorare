import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}"],
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
        rare: "#D2483F",
        superrare: "#4B7BD8",
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
