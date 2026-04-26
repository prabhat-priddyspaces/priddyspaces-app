import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#F9FAFB",
        surface: "#FFFFFF",
        surface2: "#F3F4F6",
        border: "#E5E7EB",
        textPrimary: "#111827",
        textSecondary: "#6B7280",
        textMuted: "#9CA3AF",
        accent: "#4F46E5",
        accentHover: "#4338CA",
        accentSubtle: "#EEF2FF",
        success: "#16A34A",
        warning: "#D97706",
        error: "#DC2626",
        info: "#2563EB"
      },
      borderRadius: {
        sm: "10px",
        md: "14px",
        lg: "16px"
      }
    }
  },
  plugins: []
};

export default config;
