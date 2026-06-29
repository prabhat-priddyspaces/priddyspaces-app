"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";

import { getAccessToken, getActiveImpersonationToken } from "@/lib/auth";
import { IS_E2E_BYPASS } from "@/lib/e2e-bypass";
import {
  getPreferences,
  isThemeFamily,
  isThemeMode,
  updatePreferences,
  type ThemeFamily,
  type ThemeMode,
} from "@/lib/preferences";

export const FAMILY_STORAGE_KEY = "ps-theme-family";
// Reuse the historical key for mode so existing "light"/"dark" values keep working.
export const MODE_STORAGE_KEY = "ps-theme";

const DEFAULT_FAMILY: ThemeFamily = "neutral";
const DEFAULT_MODE: ThemeMode = "system";

type ResolvedMode = "light" | "dark";

type ThemeContextValue = {
  family: ThemeFamily;
  mode: ThemeMode;
  resolvedMode: ResolvedMode;
  setFamily: (family: ThemeFamily) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

// A working default so <ThemeToggle> and other consumers still function when
// rendered outside a ThemeProvider (e.g. isolated unit tests). It writes the
// same storage keys and applies to <html>; only server sync requires the
// provider. ThemeProvider always overrides this in the running app.
const DEFAULT_CONTEXT: ThemeContextValue = {
  family: DEFAULT_FAMILY,
  mode: DEFAULT_MODE,
  resolvedMode: "light",
  setFamily: (next) => {
    writeStored(FAMILY_STORAGE_KEY, next);
    applyToDocument(next, readStoredMode());
  },
  setMode: (next) => {
    writeStored(MODE_STORAGE_KEY, next);
    applyToDocument(readStoredFamily(), next);
  },
  toggleMode: () => {
    const next: ThemeMode = resolveMode(readStoredMode()) === "dark" ? "light" : "dark";
    writeStored(MODE_STORAGE_KEY, next);
    applyToDocument(readStoredFamily(), next);
  },
};

const ThemeContext = React.createContext<ThemeContextValue>(DEFAULT_CONTEXT);

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function resolveMode(mode: ThemeMode): ResolvedMode {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

function readStoredFamily(): ThemeFamily {
  if (typeof window === "undefined") return DEFAULT_FAMILY;
  try {
    const stored = window.localStorage?.getItem(FAMILY_STORAGE_KEY);
    return isThemeFamily(stored) ? stored : DEFAULT_FAMILY;
  } catch {
    return DEFAULT_FAMILY;
  }
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const stored = window.localStorage?.getItem(MODE_STORAGE_KEY);
    return isThemeMode(stored) ? stored : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function applyToDocument(family: ThemeFamily, mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", family);
  root.classList.toggle("dark", resolveMode(mode) === "dark");
}

// Token retrieval mirrors useMe: Clerk hook normally, localStorage under E2E
// bypass (where ClerkProvider is not mounted, so useAuth must not be called).
type TokenGetter = () => Promise<string | undefined>;

function useClerkTokenGetter(): TokenGetter {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  return React.useCallback(async () => {
    if (!isLoaded || !isSignedIn) return undefined;
    return getActiveImpersonationToken() ?? (await getToken()) ?? undefined;
  }, [getToken, isLoaded, isSignedIn]);
}

function useLocalTokenGetter(): TokenGetter {
  return React.useCallback(async () => getAccessToken() ?? undefined, []);
}

const useTokenGetter: () => TokenGetter = IS_E2E_BYPASS
  ? useLocalTokenGetter
  : useClerkTokenGetter;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const getToken = useTokenGetter();

  // Lazy initializers read localStorage on the client first render, so the
  // first apply effect matches what the pre-paint init script already set.
  const [family, setFamilyState] = React.useState<ThemeFamily>(readStoredFamily);
  const [mode, setModeState] = React.useState<ThemeMode>(readStoredMode);
  const [resolvedMode, setResolvedMode] = React.useState<ResolvedMode>(() =>
    resolveMode(readStoredMode())
  );

  // Keep <html> and resolvedMode in sync with state.
  React.useEffect(() => {
    applyToDocument(family, mode);
    setResolvedMode(resolveMode(mode));
  }, [family, mode]);

  // Follow OS changes while in "system" mode.
  React.useEffect(() => {
    if (mode !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      applyToDocument(family, "system");
      setResolvedMode(resolveMode("system"));
    };
    query.addEventListener?.("change", handler);
    return () => query.removeEventListener?.("change", handler);
  }, [mode, family]);

  // When authenticated, the account is the source of truth; reconcile + mirror.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      try {
        const prefs = await getPreferences(token);
        if (cancelled) return;
        const nextFamily = isThemeFamily(prefs.theme_family) ? prefs.theme_family : DEFAULT_FAMILY;
        const nextMode = isThemeMode(prefs.theme_mode) ? prefs.theme_mode : DEFAULT_MODE;
        writeStored(FAMILY_STORAGE_KEY, nextFamily);
        writeStored(MODE_STORAGE_KEY, nextMode);
        setFamilyState(nextFamily);
        setModeState(nextMode);
      } catch {
        /* keep the localStorage fallback already applied */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const persist = React.useCallback(
    async (nextFamily: ThemeFamily, nextMode: ThemeMode) => {
      const token = await getToken();
      if (!token) return;
      try {
        await updatePreferences({ theme_family: nextFamily, theme_mode: nextMode }, token);
      } catch {
        /* non-fatal: localStorage keeps the choice on this device */
      }
    },
    [getToken]
  );

  const setFamily = React.useCallback(
    (nextFamily: ThemeFamily) => {
      setFamilyState(nextFamily);
      writeStored(FAMILY_STORAGE_KEY, nextFamily);
      void persist(nextFamily, mode);
    },
    [persist, mode]
  );

  const setMode = React.useCallback(
    (nextMode: ThemeMode) => {
      setModeState(nextMode);
      writeStored(MODE_STORAGE_KEY, nextMode);
      void persist(family, nextMode);
    },
    [persist, family]
  );

  const toggleMode = React.useCallback(() => {
    setMode(resolveMode(mode) === "dark" ? "light" : "dark");
  }, [setMode, mode]);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ family, mode, resolvedMode, setFamily, setMode, toggleMode }),
    [family, mode, resolvedMode, setFamily, setMode, toggleMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return React.useContext(ThemeContext);
}
