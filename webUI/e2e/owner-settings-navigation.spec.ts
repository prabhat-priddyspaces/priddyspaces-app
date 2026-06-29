import { expect, type Page, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

async function routeSettingsApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner", { company_name: "Skyline Works NYC" }));
      return;
    }
    if (key === "GET /api/orgs") {
      await json(route, [
        {
          public_id: "org_1",
          name: "Skyline Works NYC",
          branding: "Premium coworking",
          review_status: "approved",
          review_notes: null,
        },
      ]);
      return;
    }
    if (key === "GET /api/orgs/org_1/booking-settings") {
      await json(route, {
        public_id: "org_1",
        name: "Skyline Works NYC",
        booking_approval_mode: "manual",
        membership_lease_approval_mode: "manual",
        payment_failure_hold_minutes: 30,
        waitlist_enabled: false,
        waitlist_conference_room_enabled: false,
        waitlist_private_office_enabled: false,
        waitlist_shared_desk_enabled: false,
        waitlist_suite_enabled: false,
        waitlist_virtual_office_enabled: false,
      });
      return;
    }
    if (key === "GET /api/marketing/settings") {
      await json(route, {
        default_sender_lane: "shared",
        verified_sender_public_id: null,
        shared_daily_cap: 100,
        verified_sender_daily_cap: 1000,
        shared_from_name: "Priddyspaces",
        shared_from_email: "hello@priddyspaces.com",
        verified_senders: [],
      });
      return;
    }
    if (
      key === "GET /api/promo-codes" ||
      key === "GET /api/cancellation-policies" ||
      key === "GET /api/orgs/org_1/amenities"
    ) {
      await json(route, []);
      return;
    }
    if (key === "GET /api/tax-config") {
      await json(route, { detail: "Not configured" }, 404);
      return;
    }
    if (key === "GET /api/owner/marketplace-readiness") {
      await json(route, []);
      return;
    }
    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });
}

test("owner navigates between settings sections via the sub-nav", async ({ page }) => {
  await mockSession(page, "owner");
  await routeSettingsApi(page);

  await page.goto("/owner/settings");
  await expect(page.getByRole("heading", { name: "Organization profile" })).toBeVisible();

  // The organization selected in the shared scope selector persists across tabs.
  await expect(page.getByLabel("Organization", { exact: true })).toHaveValue("org_1");

  await page.getByRole("link", { name: "Booking rules" }).click();
  await expect(page).toHaveURL(/\/owner\/settings\/booking$/);
  await expect(page.getByRole("heading", { name: "Booking approval" })).toBeVisible();
  await expect(page.getByLabel("Organization", { exact: true })).toHaveValue("org_1");

  await page.getByRole("link", { name: "Pricing & promotions" }).click();
  await expect(page).toHaveURL(/\/owner\/settings\/pricing$/);
  await expect(page.getByRole("heading", { name: "Promo codes" })).toBeVisible();

  // The previously-hidden email sender settings are now reachable from the hub.
  await page.getByRole("link", { name: "Email sender" }).click();
  await expect(page).toHaveURL(/\/owner\/settings\/marketing$/);
  await expect(page.getByRole("heading", { name: "Default sender lane" })).toBeVisible();
});

test("legacy marketing settings url redirects into the settings hub", async ({ page }) => {
  await mockSession(page, "owner");
  await routeSettingsApi(page);

  await page.goto("/owner/marketing/settings");

  await expect(page).toHaveURL(/\/owner\/settings\/marketing$/);
  await expect(page.getByRole("heading", { name: "Default sender lane" })).toBeVisible();
});
