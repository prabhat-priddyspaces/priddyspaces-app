"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

const STORAGE_KEY = "ps-theme";

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    let stored: string | null = null;
    try {
      stored = window.localStorage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      stored = null;
    }
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
      applyTheme(stored);
      return;
    }
    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = prefersDark ? "dark" : "light";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage?.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mounted ? `Switch to ${theme === "dark" ? "light" : "dark"} mode` : "Toggle theme"}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:shadow-ring",
        className
      )}
    >
      {mounted && theme === "dark" ? (
        <Sun size={16} strokeWidth={1.6} />
      ) : (
        <Moon size={16} strokeWidth={1.6} />
      )}
    </button>
  );
}
