export const AUTH_TOKEN_KEY = "priddyspaces_access_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAccessToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAccessToken() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return atob(padded);
  } catch {
    return null;
  }
}

export function getAccessTokenPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const [, payload] = token.split(".");
  if (!payload) return null;
  const decoded = decodeBase64Url(payload);
  if (!decoded) return null;
  try {
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isImpersonationToken(token: string | null | undefined): boolean {
  const payload = getAccessTokenPayload(token);
  const actorSub = payload?.actor_sub;
  return typeof actorSub === "string" && actorSub.length > 0;
}

export function getActiveImpersonationToken(): string | null {
  const token = getAccessToken();
  return isImpersonationToken(token) ? token : null;
}
