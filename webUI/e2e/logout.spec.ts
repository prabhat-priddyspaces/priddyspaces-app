import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

const AUTH_TOKEN_KEY = "priddyspaces_access_token";

test("owner logout clears the app session and returns to public spaces", async ({ page }) => {
  await mockSession(page, "owner");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner", { company_name: "Downtown Cowork" }));
      return;
    }
    if (key === "GET /api/orgs") {
      await json(route, [{ public_id: "org_1", name: "Downtown Cowork" }]);
      return;
    }
    if (key === "GET /api/owner/calendar") {
      await json(route, { spaces: [], events: [] });
      return;
    }

    await json(route, []);
  });

  await page.goto("/owner");
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/spaces$/);
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), AUTH_TOKEN_KEY))
    .toBeNull();
});
