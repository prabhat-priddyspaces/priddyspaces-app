import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Legacy tokens — still used by pages that haven't been refactored to the new design.
        // Removed in Phase 7e cleanup once every consumer is migrated.
        background: "#F9FAFB",
        surface2: "#F3F4F6",
        border: "#E5E7EB",
        textPrimary: "#111827",
        textSecondary: "#6B7280",
        textMuted: "#9CA3AF",
        accent: "#4F46E5",
        accentHover: "#4338CA",
        accentSubtle: "#EEF2FF",

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
        violet: {
          50: "#F5F2FF",
          100: "#EAE3FF",
          200: "#D5C7FF",
          300: "#B59FFF",
          400: "#9576FF",
          500: "#7C5BF5",
          600: "#6741E0",
          700: "#5430C2",
          800: "#3F2596",
          900: "#28195D",
        },
        mint: {
          50: "#ECFBF5",
          100: "#D2F4E6",
          300: "#7FDDB8",
          500: "#2EB888",
          700: "#15885F",
        },
        success: { DEFAULT: "#15885F", soft: "var(--ps-success-bg)" },
        warning: { DEFAULT: "#B25B00", soft: "var(--ps-warning-bg)" },
        danger: { DEFAULT: "#C0271F", soft: "var(--ps-danger-bg)" },
        info: { DEFAULT: "#1E5FD1", soft: "var(--ps-info-bg)" },
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
