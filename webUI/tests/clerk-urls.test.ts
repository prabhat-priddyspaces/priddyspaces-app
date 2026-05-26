import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAppOrigin,
  getClerkProviderRedirectProps,
  getSignOutRedirectTarget,
  toAppUrl,
} from "../lib/clerk-urls";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Clerk URL configuration", () => {
  it("uses relative app paths when no app origin is configured", () => {
    expect(getAppOrigin()).toBe("");
    expect(toAppUrl("/sign-in")).toBe("/sign-in");
    expect(getClerkProviderRedirectProps()).toEqual({
      signInUrl: "/sign-in",
      signUpUrl: "/sign-up",
      signInForceRedirectUrl: "/dashboard",
      signUpForceRedirectUrl: "/dashboard",
      signInFallbackRedirectUrl: "/dashboard",
      signUpFallbackRedirectUrl: "/dashboard",
    });
  });

  it("derives Clerk URLs from NEXT_PUBLIC_APP_ORIGIN", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ORIGIN", "https://app.dev.priddyspaces.com/");

    expect(getAppOrigin()).toBe("https://app.dev.priddyspaces.com");
    expect(getClerkProviderRedirectProps()).toEqual({
      signInUrl: "https://app.dev.priddyspaces.com/sign-in",
      signUpUrl: "https://app.dev.priddyspaces.com/sign-up",
      signInForceRedirectUrl: "https://app.dev.priddyspaces.com/dashboard",
      signUpForceRedirectUrl: "https://app.dev.priddyspaces.com/dashboard",
      signInFallbackRedirectUrl: "https://app.dev.priddyspaces.com/dashboard",
      signUpFallbackRedirectUrl: "https://app.dev.priddyspaces.com/dashboard",
    });
    expect(getSignOutRedirectTarget(undefined)).toBe(
      "https://app.dev.priddyspaces.com/spaces",
    );
  });

  it("lets explicit Clerk URL env values override derived paths", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ORIGIN", "https://app.dev.priddyspaces.com");
    vi.stubEnv(
      "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
      "https://login.priddyspaces.com/sign-in",
    );
    vi.stubEnv("NEXT_PUBLIC_CLERK_SIGN_UP_URL", "/owners/sign-up");

    expect(getClerkProviderRedirectProps()).toMatchObject({
      signInUrl: "https://login.priddyspaces.com/sign-in",
      signUpUrl: "https://app.dev.priddyspaces.com/owners/sign-up",
    });
  });

  it("keeps sign-out on the current page when redirectTo is null", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ORIGIN", "https://app.dev.priddyspaces.com");

    expect(getSignOutRedirectTarget(null)).toBeNull();
  });
});
