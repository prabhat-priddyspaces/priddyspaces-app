const NEXT_KEY = "priddyspaces_post_auth_next";

export function sanitizeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export function buildLoginHref(next: string): string {
  return `/sign-in?redirect_url=${encodeURIComponent(next)}`;
}

export function buildRegisterHref(next: string): string {
  return `/sign-up?redirect_url=${encodeURIComponent(next)}`;
}

export function stashOauthNext(next: string | null | undefined): void {
  const safe = sanitizeNext(next ?? null);
  if (typeof window === "undefined") return;
  try {
    if (safe) {
      window.sessionStorage.setItem(NEXT_KEY, safe);
    } else {
      window.sessionStorage.removeItem(NEXT_KEY);
    }
  } catch {
    // sessionStorage may be unavailable (private mode, etc.) — fail open.
  }
}

export function consumeOauthNext(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(NEXT_KEY);
    if (v) window.sessionStorage.removeItem(NEXT_KEY);
    return sanitizeNext(v);
  } catch {
    return null;
  }
}
