import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../lib/api";
import { clearAccessToken, registerAccessTokenProvider, setAccessToken } from "../lib/auth";

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function tokenWithPayload(payload: Record<string, unknown>): string {
  return [
    base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64Url(JSON.stringify(payload)),
    "signature",
  ].join(".");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiFetch auth retry", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.restoreAllMocks();
    store = {};
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
      },
    });
    clearAccessToken();
    registerAccessTokenProvider(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries once with a refreshed token after Token expired", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const stale = tokenWithPayload({ sub: "user_1", exp: nowSeconds + 60 });
    const fresh = tokenWithPayload({ sub: "user_1", exp: nowSeconds + 60 });
    const seenAuthHeaders: Array<string | null> = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      seenAuthHeaders.push(new Headers(init?.headers).get("Authorization"));
      if (fetchMock.mock.calls.length === 1) {
        return jsonResponse({ detail: "Token expired" }, 401);
      }
      return jsonResponse({ ok: true });
    });

    registerAccessTokenProvider(vi.fn().mockResolvedValue(fresh));
    setAccessToken(stale);
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ ok: boolean }>("/api/protected-action", { method: "POST" }, stale);

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seenAuthHeaders).toEqual([`Bearer ${stale}`, `Bearer ${fresh}`]);
  });

  it("retries once with the same non-JWT token in e2e bypass mode", async () => {
    const seenAuthHeaders: Array<string | null> = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      seenAuthHeaders.push(new Headers(init?.headers).get("Authorization"));
      if (fetchMock.mock.calls.length === 1) {
        return jsonResponse({ detail: "Token expired" }, 401);
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ ok: boolean }>(
      "/api/protected-action",
      { method: "POST" },
      "playwright-token",
    );

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seenAuthHeaders).toEqual(["Bearer playwright-token", "Bearer playwright-token"]);
  });

  it("does not replace or retry impersonation tokens", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const impersonation = tokenWithPayload({
      sub: "owner_1",
      actor_sub: "admin_1",
      exp: nowSeconds - 10,
    });
    const fetchMock = vi.fn(async () => jsonResponse({ detail: "Token expired" }, 401));
    const provider = vi.fn().mockResolvedValue(tokenWithPayload({ sub: "admin_1", exp: nowSeconds + 60 }));

    registerAccessTokenProvider(provider);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiFetch("/api/protected-action", { method: "POST" }, impersonation),
    ).rejects.toThrow("Token expired");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(provider).not.toHaveBeenCalled();
  });
});
