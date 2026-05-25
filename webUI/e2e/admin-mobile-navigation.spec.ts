import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("admin mobile navigation drawer and dashboard stats reach account lists", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSession(page, "admin");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("admin"));
      return;
    }
    if (key === "GET /api/admin/dashboard") {
      await json(route, {
        metrics: {
          users: 12,
          members: 7,
          owner_companies: 3,
          live_listings: 10,
          bookings: 4,
          booking_requests: 2,
          gmv: 500,
          platform_earnings: 50,
        },
        recent_activity: [],
      });
      return;
    }
    if (key === "GET /api/admin/users") {
      await json(route, {
        results: [
          {
            public_id: "member_1",
            email: "mobile-member@example.com",
            name: "Mobile Member",
            role: "member",
            app_role: "member",
            platform_role: null,
            is_active: true,
            email_verified: true,
            created_at: "2026-05-01T12:00:00.000Z",
            last_activity_at: "2026-05-02T12:00:00.000Z",
            organization_count: 0,
            bookings: 1,
            payments: 1,
            subscriptions: 0,
          },
        ],
        total: 1,
        page: 1,
        page_size: 25,
      });
      return;
    }
    if (key === "GET /api/admin/members") {
      await json(route, []);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Platform Console" }).first()).toBeVisible();

  await page.getByTestId("mobile-menu-button").click();
  const drawer = page.getByTestId("mobile-sidebar-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Users", exact: true })).toBeVisible();
  await drawer.getByRole("link", { name: "Members" }).click();
  await expect(page).toHaveURL(/\/admin\/members$/);
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();

  await page.goto("/admin");
  await page.getByTestId("admin-stat-users").click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("heading", { name: "Users" }).first()).toBeVisible();
  await expect(page.getByText("Mobile Member")).toBeVisible();
});
