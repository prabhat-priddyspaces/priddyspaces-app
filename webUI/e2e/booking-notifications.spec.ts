import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("member can turn off meeting-room end reminder notifications", async ({ page }) => {
  await mockSession(page, "member");
  let patchPayload: Record<string, unknown> | null = null;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;
    if (key === "GET /api/me") return json(route, meResponse("member"));
    if (key === "GET /api/notifications/preferences") {
      return json(route, { booking_start_push_enabled: true, booking_end_push_enabled: true });
    }
    if (key === "PATCH /api/notifications/preferences") {
      patchPayload = route.request().postDataJSON();
      return json(route, { booking_start_push_enabled: true, booking_end_push_enabled: false });
    }
    if (key === "GET /api/notifications") {
      return json(route, { results: [], total: 0, unread_count: 0, page: 1, page_size: 25 });
    }
    return json(route, {});
  });

  await page.goto("/member/profile");
  await expect(page.getByText("Booking reminder notifications")).toBeVisible();
  await page.getByLabel("Before meeting-room booking ends").click();

  await expect.poll(() => patchPayload).toEqual({ booking_end_push_enabled: false });
});
