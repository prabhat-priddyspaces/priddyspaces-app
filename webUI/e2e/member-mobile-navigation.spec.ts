import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("member mobile drawer reaches nav items the bottom nav omits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSession(page, "member");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("member"));
      return;
    }

    await json(route, []);
  });

  await page.goto("/member/requests");

  // Desktop sidebar hidden on mobile; open the drawer via the hamburger.
  await expect(page.getByTestId("workspace-sidebar")).toBeHidden();
  await page.getByTestId("mobile-menu-button").click();

  const drawer = page.getByTestId("mobile-sidebar-drawer");
  await expect(drawer).toBeVisible();

  // "Invoices" is not in the customer bottom nav — only via the drawer.
  await expect(
    drawer.getByRole("link", { name: "Invoices", exact: true })
  ).toBeVisible();
  await drawer.getByRole("link", { name: "Invoices", exact: true }).click();

  await expect(page).toHaveURL(/\/member\/invoices$/);
  await expect(page.getByTestId("workspace-main")).toBeVisible();
});
