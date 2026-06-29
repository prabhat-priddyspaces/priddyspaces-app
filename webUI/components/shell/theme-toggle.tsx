"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedMode, toggleMode } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Avoid a hydration mismatch: render the default icon until mounted, since
  // the resolved mode depends on localStorage / OS preference (client-only).
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedMode === "dark";

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Toggle theme"}
      data-testid="theme-toggle"
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:shadow-ring",
        className
      )}
    >
      {mounted && isDark ? (
        <Sun size={16} strokeWidth={1.6} />
      ) : (
        <Moon size={16} strokeWidth={1.6} />
      )}
    </button>
  );
}
