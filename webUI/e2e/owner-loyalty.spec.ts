import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("owner configures Priddy Points acceptance within platform eligibility", async ({ page }) => {
  let savedSettings: Record<string, unknown> | null = null;
  const settings = {
    public_id: "settings_1",
    organization_public_id: "org_1",
    is_enabled: true,
    accepts_priddy_points: false,
    owner_points_redemption_enabled: true,
    platform_priddy_points_enabled: true,
    platform_priddy_allowed_space_types: ["shared_desk"],
    platform_priddy_allowed_booking_modes: ["day_pass"],
    point_value_cents: 1,
    earn_rate_bps: 100,
    earn_points_per_dollar: 1,
    earn_points_per_100_dollars: 100,
    max_redemption_percent: 100,
    allowed_space_types: ["conference_room", "shared_desk"],
    allowed_booking_modes: ["hourly", "day_pass"],
    promo_expiration_days: 180,
    earned_expiration_days: 730,
    campaign_daily_issue_cap: 500000,
    max_promo_grant_points: 100000,
    updated_at: null,
  };

  await mockSession(page, "owner");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }
    if (key === "GET /api/orgs") {
      await json(route, [{ public_id: "org_1", name: "Shared Desk Owner" }]);
      return;
    }
    if (key === "GET /api/loyalty/settings") {
      await json(route, settings);
      return;
    }
    if (key === "PUT /api/loyalty/settings") {
      savedSettings = route.request().postDataJSON() as Record<string, unknown>;
      Object.assign(settings, savedSettings);
      await json(route, settings);
      return;
    }
    if (key === "GET /api/loyalty/owner/summary") {
      await json(route, {
        organization_public_id: "org_1",
        points_issued: 0,
        points_redeemed: 0,
        outstanding_points: 0,
        outstanding_liability_cents: 0,
        redemption_rate_percent: 0,
        repeat_member_rate_percent: 0,
        active_wallets: 0,
        campaigns: 0,
        top_members: [],
      });
      return;
    }
    if (key === "GET /api/loyalty/campaigns") {
      await json(route, []);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/loyalty");

  await expect(page.getByRole("heading", { name: "Loyalty" })).toBeVisible();
  const priddySpaces = page.getByTestId("priddy-space-eligibility");
  await expect(priddySpaces.getByText("Shared desk")).toBeVisible();
  await expect(priddySpaces.getByText("Conference room")).toHaveCount(0);
  const priddyBookingTypes = page.getByTestId("priddy-booking-eligibility");
  await expect(priddyBookingTypes.getByText("Day pass")).toBeVisible();
  await expect(priddyBookingTypes.getByText("Hourly")).toHaveCount(0);

  await page.getByLabel("Accept Priddy Points").check();
  await page.getByRole("button", { name: "Save settings" }).click();

  await expect(page.getByText("Loyalty settings saved")).toBeVisible();
  expect(savedSettings).toMatchObject({
    accepts_priddy_points: true,
    allowed_space_types: ["conference_room", "shared_desk"],
    allowed_booking_modes: ["hourly", "day_pass"],
  });
});
