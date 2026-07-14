import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        mia: {
          blue: "#0057B8",
          sky: "#87CEEB",
          dark: "#1a1a2e",
          panel: "#16213e",
          accent: "#00d4ff",
        },
      },
    },
  },
  plugins: [],
};

export default config;
