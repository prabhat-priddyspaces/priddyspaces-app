import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("owner creates a new space with setup fees and sees them on edit", async ({ page }) => {
  let createdSetupFees: Array<{
    label: string;
    amount_cents: number;
    is_active: boolean;
    sort_order: number;
  }> | null = null;

  await mockSession(page, "owner");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }
    if (key === "GET /api/owner/marketplace-readiness") {
      await json(route, []);
      return;
    }
    if (key === "GET /api/orgs") {
      await json(route, [{ public_id: "org_1", name: "Owner Org" }]);
      return;
    }
    if (key === "GET /api/locations") {
      await json(route, [{ public_id: "loc_1", name: "Austin Hub", city: "Austin" }]);
      return;
    }
    if (key === "GET /api/locations/loc_1/spaces") {
      await json(route, []);
      return;
    }
    if (key === "POST /api/spaces") {
      const body = route.request().postDataJSON() as {
        setup_fee_items?: Array<{
          label: string;
          amount_cents: number;
          is_active: boolean;
          sort_order: number;
        }>;
      };
      createdSetupFees = body.setup_fee_items ?? [];
      await json(route, { public_id: "space_created" });
      return;
    }
    if (key === "GET /api/spaces/space_created") {
      await json(route, {
        public_id: "space_created",
        name: "Board Room",
        space_type: "conference_room",
        capacity: 8,
        price_monthly: null,
        price_daily: "300.00",
        price_hourly: "75.00",
        availability_status: "available",
        availability_start_time: "09:00:00",
        availability_end_time: "17:00:00",
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        visibility: "public",
      });
      return;
    }
    if (key === "GET /api/spaces/space_created/setup-fees") {
      await json(
        route,
        (createdSetupFees ?? []).map((item, index) => ({
          public_id: `setup_${index + 1}`,
          ...item,
        })),
      );
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/spaces/new?locationId=loc_1");

  await expect(page.getByRole("heading", { name: "Create a Space" })).toBeVisible();
  await page.getByLabel("Listing name").fill("Board Room");
  await page.getByRole("button", { name: "Add fee" }).click();
  await page.getByRole("button", { name: "Add fee" }).click();
  await page.getByLabel("Line item").nth(0).fill("Room setup");
  await page.getByLabel("Amount ($)").nth(0).fill("75");
  await page.getByLabel("Line item").nth(1).fill("AV kit");
  await page.getByLabel("Amount ($)").nth(1).fill("25");
  await page.getByRole("button", { name: "Save Space" }).click();

  await expect.poll(() => createdSetupFees).toEqual([
    { label: "Room setup", amount_cents: 7500, is_active: true, sort_order: 0 },
    { label: "AV kit", amount_cents: 2500, is_active: true, sort_order: 1 },
  ]);

  await page.goto("/owner/spaces/space_created/edit");

  await expect(page.getByRole("heading", { name: "Edit Space" })).toBeVisible();
  await expect(page.getByLabel("Line item").nth(0)).toHaveValue("Room setup");
  await expect(page.getByLabel("Amount ($)").nth(0)).toHaveValue("75");
  await expect(page.getByLabel("Line item").nth(1)).toHaveValue("AV kit");
  await expect(page.getByLabel("Amount ($)").nth(1)).toHaveValue("25");
});
