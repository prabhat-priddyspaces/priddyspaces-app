import { expect, type Page, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

interface Prefs {
  theme_family: string;
  theme_mode: string;
}

async function routeAdminSettingsApi(page: Page, prefs: Prefs) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("admin"));
      return;
    }
    if (key === "GET /api/admin/settings") {
      await json(route, {
        default_owner_commission_pct: 10,
        priddy_points_enabled: true,
        priddy_signup_points: 1000,
        priddy_point_value_cents: 1,
        priddy_allowed_space_types: ["shared_desk"],
        priddy_allowed_booking_modes: ["day_pass"],
        booking_calendar_daily_prices_enabled: false,
        current_admin: {
          public_id: "admin_1",
          email: "admin@priddyspaces.test",
          first_name: "Test",
          last_name: "Admin",
          name: "Test Admin",
          created_at: "2026-05-01T12:00:00.000Z",
          has_password: true,
        },
      });
      return;
    }
    if (key === "GET /api/preferences") {
      await json(route, prefs);
      return;
    }
    if (key === "PATCH /api/preferences") {
      const body = route.request().postDataJSON() as Partial<Prefs>;
      if (body.theme_family) prefs.theme_family = body.theme_family;
      if (body.theme_mode) prefs.theme_mode = body.theme_mode;
      await json(route, prefs);
      return;
    }
    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });
}

test("admin changes theme from platform settings and it persists", async ({ page }) => {
  const prefs: Prefs = { theme_family: "neutral", theme_mode: "system" };
  await mockSession(page, "admin");
  await routeAdminSettingsApi(page, prefs);

  await page.goto("/admin/settings");
  await expect(page.getByTestId("theme-family-warm")).toBeVisible();

  await page.getByTestId("theme-family-warm").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "warm");
  await expect.poll(() => prefs.theme_family).toBe("warm");

  await page.getByTestId("theme-mode-dark").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect.poll(() => prefs.theme_mode).toBe("dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "warm");
  await expect(page.locator("html")).toHaveClass(/dark/);
});
