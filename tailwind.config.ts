import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#0B1220", 900: "#111A2E", 800: "#1B2640", 700: "#2A3756", 500: "#5B6886", 400: "#8A95AE", 300: "#B7BFD1", 200: "#DCE1EC", 100: "#EEF1F7", 50: "#F7F8FB" },
        isar: { 700: "#0B6E6A", 600: "#0E8580", 500: "#14A39D", 100: "#D7F3F1", 50: "#EEFAF9" },
        amber: { 600: "#C2780A", 100: "#FDF0D7" },
        rose: { 600: "#C2334D", 100: "#FBE3E8" },
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"], display: ["var(--font-display)", "var(--font-sans)", "serif"] },
      boxShadow: { card: "0 1px 2px rgba(11,18,32,.04), 0 4px 16px rgba(11,18,32,.06)" },
    },
  },
  plugins: [],
} satisfies Config;
