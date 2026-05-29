export const AUTH_TOKEN_KEY = "priddyspaces_access_token";

export type AccessTokenProvider = (options?: { skipCache?: boolean }) => Promise<string | null>;

const TOKEN_REFRESH_SKEW_SECONDS = 15;

let memoryAccessToken: string | null = null;
let accessTokenProvider: AccessTokenProvider | null = null;
let refreshPromise: Promise<string | null> | null = null;

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

export function registerAccessTokenProvider(provider: AccessTokenProvider | null): void {
  accessTokenProvider = provider;
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

export function isAccessTokenExpired(
  token: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  const payload = getAccessTokenPayload(token);
  const exp = payload?.exp;
  return typeof exp === "number" && exp <= Math.floor(nowMs / 1000);
}

export function shouldRefreshAccessToken(
  token: string | null | undefined,
  skewSeconds = TOKEN_REFRESH_SKEW_SECONDS,
  nowMs = Date.now(),
): boolean {
  const payload = getAccessTokenPayload(token);
  const exp = payload?.exp;
  return typeof exp === "number" && exp <= Math.floor(nowMs / 1000) + skewSeconds;
}

export async function refreshAccessToken(): Promise<string | null> {
  if (!accessTokenProvider) return null;
  if (!refreshPromise) {
    refreshPromise = accessTokenProvider({ skipCache: true })
      .then((token) => {
        if (token) setAccessToken(token);
        else clearAccessToken();
        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function getValidAccessToken(
  token: string | null | undefined = getAccessToken(),
  options: { forceRefresh?: boolean } = {},
): Promise<string | null> {
  const candidate = token ?? null;
  if (isImpersonationToken(candidate)) return candidate;
  if (!options.forceRefresh && !shouldRefreshAccessToken(candidate)) return candidate;

  try {
    const refreshed = await refreshAccessToken();
    return refreshed ?? candidate;
  } catch {
    return candidate;
  }
}
