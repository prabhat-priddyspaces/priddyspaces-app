import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("owner mobile drawer reaches nav items the bottom nav omits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSession(page, "owner");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner", { company_name: "Acme Spaces" }));
      return;
    }

    // The owner dashboard and downstream pages fan out to several list
    // endpoints; default everything else to empty so the shell renders and we
    // can exercise navigation rather than page data.
    await json(route, []);
  });

  await page.goto("/owner");

  // The desktop sidebar is hidden on mobile; the hamburger is the entry point.
  await expect(page.getByTestId("workspace-sidebar")).toBeHidden();
  await page.getByTestId("mobile-menu-button").click();

  const drawer = page.getByTestId("mobile-sidebar-drawer");
  await expect(drawer).toBeVisible();

  // "Invoices" is not in the 4-item bottom nav — only reachable via the drawer.
  await expect(
    drawer.getByRole("link", { name: "Invoices", exact: true })
  ).toBeVisible();
  await drawer.getByRole("link", { name: "Invoices", exact: true }).click();

  await expect(page).toHaveURL(/\/owner\/invoices$/);
  await expect(page.getByTestId("workspace-main")).toBeVisible();
});
