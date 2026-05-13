import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("owner can toggle new booking emails for a team member", async ({ page }) => {
  const member = {
    public_id: "om_1",
    user_id: 7,
    user_public_id: "user_1",
    user_email: "ops@example.com",
    role: "admin",
    can_override_pricing: false,
    receives_new_booking_email: true,
    location_public_ids: ["loc_1"],
  };
  let patchPayload: { receives_new_booking_email?: boolean } | null = null;

  await mockSession(page, "owner");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }

    if (key === "GET /api/orgs") {
      await json(route, [{ public_id: "org_1", name: "Owner Org" }]);
      return;
    }

    if (key === "GET /api/orgs/org_1/members") {
      await json(route, [member]);
      return;
    }

    if (key === "PATCH /api/orgs/org_1/members/om_1") {
      patchPayload = route.request().postDataJSON();
      member.receives_new_booking_email = Boolean(patchPayload?.receives_new_booking_email);
      await json(route, member);
      return;
    }

    if (key === "GET /api/locations") {
      await json(route, [{ public_id: "loc_1", name: "Main" }]);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/team");

  await expect(page.getByText("ops@example.com")).toBeVisible();
  await page.getByLabel("New booking emails").last().uncheck();

  expect(patchPayload).toEqual({ receives_new_booking_email: false });
  await expect(page.getByText("No team members are selected to receive new booking emails.")).toBeVisible();
});
