import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

const sharedDesk = {
  public_id: "space_shared",
  name: "Shared Desk",
  space_type: "shared_desk",
  location_public_id: "loc_1",
  location_name: "Rochester",
  location_timezone: "UTC",
  capacity: 10,
};

const meetingRoom = {
  public_id: "space_room",
  name: "Meeting Room",
  space_type: "conference_room",
  location_public_id: "loc_1",
  location_name: "Rochester",
  location_timezone: "UTC",
  capacity: 4,
};

function eventFor(overrides: Record<string, unknown>) {
  return {
    kind: "booking",
    public_id: "booking_1",
    space_public_id: "space_shared",
    space_name: "Shared Desk",
    space_type: "shared_desk",
    location_public_id: "loc_1",
    location_name: "Rochester",
    start: "2026-06-01T09:00:00.000Z",
    end: "2026-06-01T18:00:00.000Z",
    status: "booking.confirmed",
    payment_status: "succeeded",
    member: { public_id: "member_1", name: "Member One", email: "one@example.com" },
    amount_cents: 50000,
    checked_in: false,
    no_show: false,
    request_kind: "daily_booking",
    plan_name: null,
    seats_requested: 1,
    ...overrides,
  };
}

async function routeCalendarApis(page: any) {
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
    if (key === "GET /api/locations") {
      await json(route, [{ public_id: "loc_1", name: "Rochester" }]);
      return;
    }
    if (key === "GET /api/owner/calendar") {
      const start = url.searchParams.get("start") || "2026-06-01T00:00:00.000Z";
      const end = url.searchParams.get("end") || "2026-06-04T00:00:00.000Z";
      await json(route, {
        start,
        end,
        truncated: false,
        spaces: [sharedDesk, meetingRoom],
        events: [
          eventFor({ public_id: "booking_1", member: { public_id: "m1", name: "Member One", email: "one@example.com" } }),
          eventFor({ public_id: "booking_2", member: { public_id: "m2", name: "Member Two", email: "two@example.com" } }),
          eventFor({ public_id: "booking_3", member: { public_id: "m3", name: "Member Three", email: "three@example.com" } }),
          eventFor({
            kind: "request",
            public_id: "request_1",
            status: "request.requested",
            payment_status: "not_charged",
            member: { public_id: "m4", name: "Member Four", email: "four@example.com" },
          }),
          eventFor({
            public_id: "booking_room",
            space_public_id: "space_room",
            space_name: "Meeting Room",
            space_type: "conference_room",
            start: "2026-06-01T12:00:00.000Z",
            end: "2026-06-01T14:00:00.000Z",
            member: { public_id: "m5", name: "Room Member", email: "room@example.com" },
          }),
        ],
      });
      return;
    }
    if (key === "POST /api/booking-requests/request_1/approve") {
      await json(route, { status: "approved" });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });
}

test("owner calendar rolls up shared desk slot statuses", async ({ page }) => {
  await mockSession(page, "owner");
  await routeCalendarApis(page);

  await page.goto("/owner/calendar");

  await expect(page.getByText("3 booked • 1 pending").first()).toBeVisible();
  await expect(page.getByText("4/10 seats").first()).toBeVisible();
  await expect(page.getByText("1 booked", { exact: true }).first()).toBeVisible();

  await page.getByText("3 booked • 1 pending").first().click();
  await expect(page.getByText("Booked · 3")).toBeVisible();
  await expect(page.getByText("Pending · 1")).toBeVisible();
  await expect(page.getByText("Member Four")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
});
