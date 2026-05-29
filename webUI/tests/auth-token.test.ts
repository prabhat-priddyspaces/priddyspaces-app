import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_TOKEN_KEY,
  clearAccessToken,
  getAccessToken,
  getAccessTokenPayload,
  getActiveImpersonationToken,
  getValidAccessToken,
  isAccessTokenExpired,
  isImpersonationToken,
  registerAccessTokenProvider,
  setAccessToken,
  shouldRefreshAccessToken,
} from "../lib/auth";

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function tokenWithPayload(payload: Record<string, unknown>): string {
  return [
    base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    base64Url(JSON.stringify(payload)),
    "signature",
  ].join(".");
}

describe("access-token helpers", () => {
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

  it("reads an impersonation payload from an internal JWT", () => {
    const token = tokenWithPayload({
      sub: "owner_1",
      email: "owner@example.com",
      actor_sub: "admin_1",
    });

    expect(getAccessTokenPayload(token)).toMatchObject({
      sub: "owner_1",
      actor_sub: "admin_1",
    });
    expect(isImpersonationToken(token)).toBe(true);
  });

  it("does not treat normal tokens as impersonation tokens", () => {
    const token = tokenWithPayload({
      sub: "admin_1",
      email: "admin@example.com",
    });

    expect(isImpersonationToken(token)).toBe(false);
  });

  it("keeps the active token in memory without persisting to localStorage", () => {
    const token = tokenWithPayload({
      sub: "owner_1",
      email: "owner@example.com",
      actor_sub: "admin_1",
    });

    setAccessToken(token);

    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(getAccessToken()).toBe(token);
    expect(getActiveImpersonationToken()).toBe(token);
  });

  it("detects expired and near-expired JWTs", () => {
    const nowMs = 1_700_000_000_000;
    const nowSeconds = Math.floor(nowMs / 1000);
    const expired = tokenWithPayload({ sub: "owner_1", exp: nowSeconds - 1 });
    const nearExpiry = tokenWithPayload({ sub: "owner_1", exp: nowSeconds + 10 });
    const valid = tokenWithPayload({ sub: "owner_1", exp: nowSeconds + 60 });

    expect(isAccessTokenExpired(expired, nowMs)).toBe(true);
    expect(shouldRefreshAccessToken(nearExpiry, 15, nowMs)).toBe(true);
    expect(shouldRefreshAccessToken(valid, 15, nowMs)).toBe(false);
  });

  it("does not refresh non-JWT e2e bypass tokens", async () => {
    const provider = vi.fn().mockResolvedValue("fresh-token");
    registerAccessTokenProvider(provider);

    const token = await getValidAccessToken("playwright-token");

    expect(token).toBe("playwright-token");
    expect(provider).not.toHaveBeenCalled();
  });

  it("refreshes stale Clerk tokens through the registered provider", async () => {
    const nowMs = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(nowMs);
    const nowSeconds = Math.floor(nowMs / 1000);
    const stale = tokenWithPayload({ sub: "owner_1", exp: nowSeconds - 1 });
    const fresh = tokenWithPayload({ sub: "owner_1", exp: nowSeconds + 60 });
    const provider = vi.fn().mockResolvedValue(fresh);
    registerAccessTokenProvider(provider);
    setAccessToken(stale);

    const token = await getValidAccessToken(getAccessToken());

    expect(token).toBe(fresh);
    expect(getAccessToken()).toBe(fresh);
    expect(provider).toHaveBeenCalledWith({ skipCache: true });
  });

  it("does not replace impersonation tokens with refreshed Clerk tokens", async () => {
    const nowMs = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(nowMs);
    const nowSeconds = Math.floor(nowMs / 1000);
    const impersonation = tokenWithPayload({
      sub: "owner_1",
      actor_sub: "admin_1",
      exp: nowSeconds - 1,
    });
    const provider = vi.fn().mockResolvedValue(tokenWithPayload({ sub: "admin_1", exp: nowSeconds + 60 }));
    registerAccessTokenProvider(provider);
    setAccessToken(impersonation);

    const token = await getValidAccessToken(getAccessToken(), { forceRefresh: true });

    expect(token).toBe(impersonation);
    expect(getAccessToken()).toBe(impersonation);
    expect(provider).not.toHaveBeenCalled();
  });
});
