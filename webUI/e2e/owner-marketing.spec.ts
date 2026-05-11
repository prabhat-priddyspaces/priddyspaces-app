import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("owner can open marketing dashboard with mocked API data", async ({ page }) => {
  await mockSession(page, "owner");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }
    if (key === "GET /api/orgs") {
      await json(route, [{ public_id: "org_1", name: "Downtown Cowork" }]);
      return;
    }
    if (key === "GET /api/marketing/templates") {
      await json(route, [{ public_id: "tpl_1", name: "Welcome" }]);
      return;
    }
    if (key === "GET /api/marketing/segments") {
      await json(route, [{ public_id: "seg_1", name: "Active members" }]);
      return;
    }
    if (key === "GET /api/marketing/campaigns") {
      await json(route, [{ public_id: "camp_1", name: "May Update" }]);
      return;
    }
    if (key === "GET /api/marketing/workflows") {
      await json(route, [{ public_id: "flow_1", name: "Welcome flow" }]);
      return;
    }
    if (key === "GET /api/marketing/suppressions") {
      await json(route, [{ public_id: "sup_1", status: "active" }]);
      return;
    }
    if (key === "GET /api/marketing/settings") {
      await json(route, {
        organization_public_id: "org_1",
        default_sender_lane: "shared",
        allowed_lanes: ["shared", "verified_sender"],
        shared_daily_cap: 500,
        verified_sender_daily_cap: 2000,
        shared_from_email: "marketing@priddyspaces.com",
        shared_from_name: "Priddyspaces",
        verified_sender_public_id: null,
        verified_senders: [],
      });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/marketing");

  await expect(page.getByRole("heading", { name: "Marketing" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Templates/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Campaigns/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sender Settings/ })).toBeVisible();
});
