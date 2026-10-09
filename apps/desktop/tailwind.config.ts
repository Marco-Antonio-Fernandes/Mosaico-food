import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "hsl(var(--color-canvas) / <alpha-value>)",
        surface: "hsl(var(--color-surface) / <alpha-value>)",
        ink: "hsl(var(--color-ink) / <alpha-value>)",
        muted: "hsl(var(--color-muted) / <alpha-value>)",
        line: "hsl(var(--color-line) / <alpha-value>)",
        brand: {
          50: "hsl(var(--color-brand-50) / <alpha-value>)",
          100: "hsl(var(--color-brand-100) / <alpha-value>)",
          500: "hsl(var(--color-brand-500) / <alpha-value>)",
          600: "hsl(var(--color-brand-600) / <alpha-value>)",
          700: "hsl(var(--color-brand-700) / <alpha-value>)",
        },
        success: "hsl(var(--color-success) / <alpha-value>)",
        warning: "hsl(var(--color-warning) / <alpha-value>)",
        danger: "hsl(var(--color-danger) / <alpha-value>)",
      },
      boxShadow: {
        panel: "0 18px 45px hsl(220 35% 20% / 0.08)",
        soft: "0 8px 24px hsl(220 35% 20% / 0.06)",
      },
      borderRadius: {
        panel: "1.25rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
