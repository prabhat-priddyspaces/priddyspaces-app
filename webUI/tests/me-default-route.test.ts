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
    default_route: "/onboarding/member",
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
  it("routes new user (no role) to member onboarding", () => {
    expect(getDefaultRoute(makeMe())).toBe("/onboarding/member");
  });

  it("routes owner without org to owner onboarding", () => {
    expect(
      getDefaultRoute(makeMe({ app_role: "owner", has_organization: false }))
    ).toBe("/onboarding/owner");
  });

  it("routes owner with org to owner dashboard", () => {
    expect(
      getDefaultRoute(makeMe({ app_role: "owner", has_organization: true }))
    ).toBe("/owner");
  });

  it("routes member to spaces marketplace", () => {
    expect(getDefaultRoute(makeMe({ app_role: "member" }))).toBe("/spaces");
  });

  it("routes platform admin (superadmin) to /admin regardless of app_role", () => {
    expect(
      getDefaultRoute(makeMe({ platform_role: "superadmin", app_role: "member" }))
    ).toBe("/admin");
  });

  it("routes impersonated owner to owner dashboard even when actor is platform admin", () => {
    expect(
      getDefaultRoute(makeMe({
        app_role: "owner",
        platform_role: "superadmin",
        has_organization: true,
        impersonation: {
          is_impersonating: true,
          actor_public_id: "admin_1",
          actor_email: "admin@example.com",
          actor_platform_role: "superadmin",
          target_public_id: "owner_1",
          target_email: "owner@example.com",
          reason: "Owner support review",
        },
      }))
    ).toBe("/owner");
  });

  it("routes impersonated member to member app even when actor is platform admin", () => {
    expect(
      getDefaultRoute(makeMe({
        app_role: "member",
        platform_role: "superadmin",
        impersonation: {
          is_impersonating: true,
          actor_public_id: "admin_1",
          actor_email: "admin@example.com",
          actor_platform_role: "superadmin",
          target_public_id: "member_1",
          target_email: "member@example.com",
          reason: "Member support review",
        },
      }))
    ).toBe("/member");
  });

  it("routes platform support to /admin", () => {
    expect(getDefaultRoute(makeMe({ platform_role: "support" }))).toBe("/admin");
  });

  it("falls back to server-provided default_route for unknown role", () => {
    expect(
      getDefaultRoute(makeMe({ app_role: "unknown_future_role", default_route: "/legacy" }))
    ).toBe("/legacy");
  });

  it("falls back to /onboarding/member when default_route is empty and role is unknown", () => {
    expect(
      getDefaultRoute(makeMe({ app_role: "mystery", default_route: "" }))
    ).toBe("/onboarding/member");
  });
});
