export const AUTH_TOKEN_KEY = "priddyspaces_access_token";

let memoryAccessToken: string | null = null;

function shouldUsePersistedTestToken(): boolean {
  return process.env.NEXT_PUBLIC_E2E_BYPASS_CLERK === "1";
}

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  if (memoryAccessToken) return memoryAccessToken;
  const storage = safeLocalStorage();
  if (storage && shouldUsePersistedTestToken()) {
    return storage.getItem(AUTH_TOKEN_KEY);
  }
  return null;
}

export function setAccessToken(token: string) {
  memoryAccessToken = token;
  const storage = safeLocalStorage();
  if (!storage) return;
  if (shouldUsePersistedTestToken()) {
    storage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    storage.removeItem(AUTH_TOKEN_KEY);
  }
}

export function clearAccessToken() {
  memoryAccessToken = null;
  const storage = safeLocalStorage();
  if (!storage) return;
  storage.removeItem(AUTH_TOKEN_KEY);
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
