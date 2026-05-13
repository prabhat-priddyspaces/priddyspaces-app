import { beforeEach, describe, expect, it } from "vitest";

import {
  AUTH_TOKEN_KEY,
  getAccessTokenPayload,
  getActiveImpersonationToken,
  isImpersonationToken,
  setAccessToken,
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

  it("returns the active impersonation token from localStorage", () => {
    const token = tokenWithPayload({
      sub: "owner_1",
      email: "owner@example.com",
      actor_sub: "admin_1",
    });

    setAccessToken(token);

    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBe(token);
    expect(getActiveImpersonationToken()).toBe(token);
  });
});
