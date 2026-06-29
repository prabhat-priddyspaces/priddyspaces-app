import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Legacy tokens — still used by pages that haven't been refactored to the new design.
        // Removed in Phase 7e cleanup once every consumer is migrated.
        // Resolve from the Neutral (default) family so unmigrated pages stay coherent.
        background: "#F7F8FA",
        surface2: "#F1F4F8",
        border: "#E6E9EF",
        textPrimary: "#0F172A",
        textSecondary: "#475569",
        textMuted: "#64748B",
        accent: "#4F46E5",
        accentHover: "#4338CA",
        accentSubtle: "#EEF0FE",

        // New design tokens (Priddyspaces redesign).
        bg: "var(--bg)",
        "bg-elev": "var(--bg-elev)",
        "bg-sunken": "var(--bg-sunken)",
        "bg-tint": "var(--bg-tint)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        "line-soft": "var(--line-soft)",
        text: "var(--text)",
        "text-2": "var(--text-2)",
        "text-3": "var(--text-3)",
        "text-4": "var(--text-4)",
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          soft: "var(--brand-soft)",
          strong: "var(--brand-strong)",
          fg: "var(--brand-fg)",
        },
        // Secondary scale (Neutral default) — sky. `violet` is kept as a
        // backward-compat alias for legacy purple/copper consumers.
        copper: {
          50: "#F0F9FF",
          100: "#E0F2FE",
          200: "#BAE6FD",
          300: "#7DD3FC",
          400: "#38BDF8",
          500: "#0EA5E9",
          600: "#0284C7",
          700: "#0369A1",
          800: "#075985",
          900: "#0C4A6E",
        },
        // Brand scale (Neutral default) — indigo. `mint` aliases this.
        sage: {
          50: "#EEF2FF",
          100: "#E0E7FF",
          200: "#C7D2FE",
          300: "#A5B4FC",
          400: "#818CF8",
          500: "#6366F1",
          600: "#4F46E5",
          700: "#4338CA",
          800: "#3730A3",
          900: "#312E81",
        },
        // Backward-compat utility alias — remapped to the sky secondary.
        violet: {
          50: "#F0F9FF",
          100: "#E0F2FE",
          200: "#BAE6FD",
          300: "#7DD3FC",
          400: "#38BDF8",
          500: "#0EA5E9",
          600: "#0284C7",
          700: "#0369A1",
          800: "#075985",
          900: "#0C4A6E",
        },
        mint: {
          50: "#EEF2FF",
          100: "#E0E7FF",
          300: "#A5B4FC",
          500: "#6366F1",
          700: "#4338CA",
        },
        success: { DEFAULT: "#16A34A", soft: "var(--ps-success-bg)" },
        warning: { DEFAULT: "#B45309", soft: "var(--ps-warning-bg)" },
        danger: { DEFAULT: "#DC2626", soft: "var(--ps-danger-bg)" },
        info: { DEFAULT: "#2563EB", soft: "var(--ps-info-bg)" },
        // Legacy semantic alias — old code uses `error`. Map to new danger for now.
        error: "#DC2626",
      },
      borderRadius: {
        // Legacy radii (10/14/16) preserved for unrefactored pages.
        // The new design scale (xs/sm/md/lg/xl/2xl = 6/8/12/16/20/24) overrides them via key.
        xs: "6px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        "2xl": "24px",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        pop: "var(--shadow-pop)",
        ring: "0 0 0 3px var(--ring)",
      },
      fontFamily: {
        sans: ["var(--font-geist)", "Geist", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "Geist Mono", "ui-monospace", "monospace"],
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.22, 0.61, 0.36, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
