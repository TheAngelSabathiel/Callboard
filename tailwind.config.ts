import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#16181d", soft: "#3b3f48", mute: "#6b7080" },
        paper: { DEFAULT: "#faf8f4", card: "#ffffff", line: "#e6e1d7" },
        cue: { DEFAULT: "#c2410c", soft: "#fff1e8" },
        go: "#15803d",
        stby: "#b45309",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        script: ["Courier Prime", "Courier New", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
