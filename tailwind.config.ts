import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Deep pine — primary brand color. Used for the wordmark, primary
        // actions, and price emphasis.
        brand: {
          DEFAULT: "#0F5C42",
          dark: "#0A4230",
          light: "#E4F1EA",
        },
        // Warm marigold — the one accent color, spent deliberately on
        // discount badges, the hero CTA, and small moments that should
        // feel like a good find in a busy marketplace.
        accent: {
          DEFAULT: "#E8862E",
          dark: "#C56A1A",
          light: "#FDEEDD",
        },
        // Warm neutrals instead of cold Tailwind gray — paper background,
        // ink text.
        paper: "#FAF8F3",
        ink: {
          DEFAULT: "#171A17",
          muted: "#5B6259",
          faint: "#8A9086",
        },
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(23, 26, 23, 0.04), 0 8px 20px -8px rgba(23, 26, 23, 0.10)",
        "card-hover":
          "0 4px 10px rgba(23, 26, 23, 0.06), 0 16px 32px -12px rgba(23, 26, 23, 0.16)",
      },
    },
  },
  plugins: [],
};
export default config;
