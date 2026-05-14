import { Page, Route } from "@playwright/test";

const AUTH_TOKEN_KEY = "priddyspaces_access_token";

type MockRole = "member" | "owner" | "admin";

export async function mockSession(page: Page, role: MockRole) {
  await page.addInitScript((tokenKey: string) => {
    window.localStorage.setItem(tokenKey, "playwright-token");
  }, AUTH_TOKEN_KEY);
}

export async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

interface MeOverrides {
  public_id?: string;
  email?: string;
  first_name?: string | null;
  last_name?: string | null;
}

export function meResponse(role: MockRole, overrides: MeOverrides = {}) {
  const isAdmin = role === "admin";
  return {
    public_id: overrides.public_id ?? `${role}_user`,
    email: overrides.email ?? `${role}@priddyspaces.test`,
    first_name: overrides.first_name ?? "Test",
    last_name: overrides.last_name ?? (role === "owner" ? "Owner" : isAdmin ? "Admin" : "Member"),
    role: isAdmin ? null : role,
    app_role: isAdmin ? null : role,
    platform_role: isAdmin ? "superadmin" : null,
    default_route: isAdmin ? "/admin" : role === "owner" ? "/owner" : "/member",
    impersonation: {
      is_impersonating: false,
      actor_public_id: null,
      actor_email: null,
      actor_platform_role: null,
      target_public_id: null,
      target_email: null,
      reason: null,
    },
  };
}
