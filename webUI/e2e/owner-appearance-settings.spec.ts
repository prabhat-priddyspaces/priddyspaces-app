import { expect, type Page, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

interface Prefs {
  theme_family: string;
  theme_mode: string;
}

// Stateful preferences mock: PATCH merges and persists for the lifetime of the
// page so a reload reads back what was "saved to the account".
async function routeAppearanceApi(page: Page, prefs: Prefs) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner", { company_name: "Skyline Works NYC" }));
      return;
    }
    if (key === "GET /api/orgs") {
      await json(route, [
        { public_id: "org_1", name: "Skyline Works NYC", branding: null, review_status: "approved", review_notes: null },
      ]);
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

test("owner selects a theme family and mode that persist to the account", async ({ page }) => {
  const prefs: Prefs = { theme_family: "neutral", theme_mode: "system" };
  await mockSession(page, "owner");
  await routeAppearanceApi(page, prefs);

  await page.goto("/owner/settings/appearance");
  await expect(page.getByRole("heading", { name: "Theme" })).toBeVisible();

  // Pick the Premium family -> <html data-theme> updates and the choice is saved.
  await page.getByTestId("theme-family-premium").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "premium");
  await expect.poll(() => prefs.theme_family).toBe("premium");

  // Switch to Dark mode -> <html> gets the dark class and the choice is saved.
  await page.getByTestId("theme-mode-dark").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect.poll(() => prefs.theme_mode).toBe("dark");

  // Clear the browser mirror so the reload must restore from the account, then
  // confirm the saved preferences are re-applied (account + browser fallback).
  await page.evaluate(() => window.localStorage.removeItem("ps-theme-family"));
  await page.evaluate(() => window.localStorage.removeItem("ps-theme"));
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "premium");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByTestId("theme-mode-dark")).toHaveAttribute("aria-checked", "true");
});
