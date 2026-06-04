import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("superadmin can send an owner invite from basic account info", async ({ page }) => {
  await mockSession(page, "admin");
  let invitePayload: Record<string, unknown> | null = null;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("admin"));
      return;
    }
    if (key === "GET /api/admin/users") {
      await json(route, {
        results: [],
        total: 0,
        page: 1,
        page_size: 25,
      });
      return;
    }
    if (key === "POST /api/admin/owner-invites") {
      invitePayload = route.request().postDataJSON();
      await json(route, {
        public_id: "owner_invited",
        email: "invited-owner@example.com",
        name: "Invited Owner",
        role: "owner",
        is_active: true,
        email_verified: false,
      });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/admin/users");
  await page.getByLabel("Owner email").fill("invited-owner@example.com");
  await page.getByLabel("Owner first name").fill("Invited");
  await page.getByLabel("Owner last name").fill("Owner");
  await page.getByLabel("Owner phone").fill("+1 555 222 3333");
  await page.getByLabel("Owner business name").fill("Invited Works");
  await page.getByRole("button", { name: "Send owner invite" }).click();

  await expect(page.getByText("Owner invite sent.")).toBeVisible();
  expect(invitePayload).toEqual({
    email: "invited-owner@example.com",
    first_name: "Invited",
    last_name: "Owner",
    phone: "1555222333",
    company_name: "Invited Works",
  });
});
