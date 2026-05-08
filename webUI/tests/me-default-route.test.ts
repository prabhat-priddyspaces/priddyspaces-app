import { describe, it, expect } from "vitest";

import { getDefaultRoute, type MeResponse } from "../lib/me";

function makeMe(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    public_id: "pub_1",
    email: "test@example.com",
    first_name: null,
    last_name: null,
    role: null,
    app_role: null,
    platform_role: null,
    has_organization: false,
    default_route: "/onboarding/personal",
    impersonation: {
      is_impersonating: false,
      actor_public_id: null,
      actor_email: null,
      actor_platform_role: null,
      target_public_id: null,
      target_email: null,
      reason: null,
    },
    ...overrides,
  };
}

describe("getDefaultRoute", () => {
  it("routes new user (no role) to personal onboarding", () => {
    expect(getDefaultRoute(makeMe())).toBe("/onboarding/personal");
  });

  it("routes owner without org to org onboarding", () => {
    expect(
      getDefaultRoute(makeMe({ app_role: "owner", has_organization: false }))
    ).toBe("/onboarding/organization");
  });

  it("routes owner with org to owner dashboard", () => {
    expect(
      getDefaultRoute(makeMe({ app_role: "owner", has_organization: true }))
    ).toBe("/owner");
  });

  it("routes customer to coworking marketplace", () => {
    expect(getDefaultRoute(makeMe({ app_role: "customer" }))).toBe("/coworking");
  });

  it("routes platform admin (superadmin) to /admin regardless of app_role", () => {
    expect(
      getDefaultRoute(makeMe({ platform_role: "superadmin", app_role: "customer" }))
    ).toBe("/admin");
  });

  it("routes platform support to /admin", () => {
    expect(getDefaultRoute(makeMe({ platform_role: "support" }))).toBe("/admin");
  });

  it("falls back to server-provided default_route for unknown role", () => {
    expect(
      getDefaultRoute(makeMe({ app_role: "unknown_future_role", default_route: "/legacy" }))
    ).toBe("/legacy");
  });

  it("falls back to /onboarding/personal when default_route is empty and role is unknown", () => {
    expect(
      getDefaultRoute(makeMe({ app_role: "mystery", default_route: "" }))
    ).toBe("/onboarding/personal");
  });
});
