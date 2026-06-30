import { expect, type Page, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

interface Prefs {
  theme_family: string;
  theme_mode: string;
}

async function routeMemberProfileApi(page: Page, prefs: Prefs) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("member"));
      return;
    }
    if (key === "GET /api/notifications/preferences") {
      await json(route, { booking_start_push_enabled: true, booking_end_push_enabled: true });
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

test("member changes theme from profile and it persists to the account", async ({ page }) => {
  const prefs: Prefs = { theme_family: "neutral", theme_mode: "system" };
  await mockSession(page, "member");
  await routeMemberProfileApi(page, prefs);

  await page.goto("/member/profile");
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
