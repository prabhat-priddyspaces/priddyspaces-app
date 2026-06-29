import { apiFetch } from "@/lib/api";

export type ThemeFamily = "neutral" | "warm" | "premium";
export type ThemeMode = "light" | "dark" | "system";

export const THEME_FAMILIES: ThemeFamily[] = ["neutral", "warm", "premium"];
export const THEME_MODES: ThemeMode[] = ["light", "dark", "system"];

export interface UserPreference {
  theme_family: ThemeFamily;
  theme_mode: ThemeMode;
}

export function isThemeFamily(value: unknown): value is ThemeFamily {
  return value === "neutral" || value === "warm" || value === "premium";
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function getPreferences(token?: string) {
  return apiFetch<UserPreference>("/api/preferences", { method: "GET" }, token);
}

export function updatePreferences(payload: Partial<UserPreference>, token?: string) {
  return apiFetch<UserPreference>(
    "/api/preferences",
    { method: "PATCH", body: JSON.stringify(payload) },
    token
  );
}
