import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

const spaces = [
  {
    public_id: "space_a",
    name: "Austin Room",
    space_type: "conference_room",
    location_public_id: "loc_a",
    location_name: "Austin",
    location_timezone: "UTC",
  },
  {
    public_id: "space_empty",
    name: "Unused Room",
    space_type: "conference_room",
    location_public_id: "loc_a",
    location_name: "Austin",
    location_timezone: "UTC",
  },
  {
    public_id: "space_b",
    name: "Rochester Room",
    space_type: "conference_room",
    location_public_id: "loc_b",
    location_name: "Rochester",
    location_timezone: "UTC",
  },
];

function calendarEvent(overrides: Record<string, unknown>) {
  return {
    kind: "booking",
    public_id: "booking_a",
    space_public_id: "space_a",
    space_name: "Austin Room",
    space_type: "conference_room",
    location_public_id: "loc_a",
    location_name: "Austin",
    start: "2026-06-01T09:00:00.000Z",
    end: "2026-06-01T18:00:00.000Z",
    status: "booking.confirmed",
    payment_status: "succeeded",
    member: { public_id: "member_1", name: "Test Member", email: "member@example.com" },
    amount_cents: 10000,
    checked_in: false,
    no_show: false,
    request_kind: null,
    plan_name: null,
    ...overrides,
  };
}

test("member calendar is a personal schedule with location filtering", async ({ page }) => {
  await mockSession(page, "member");
  const calendarRequests: URL[] = [];

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("member"));
      return;
    }

    if (key === "GET /api/me/calendar") {
      calendarRequests.push(url);
      const locationPublicId = url.searchParams.get("location_public_id");
      const events = [
        calendarEvent({ public_id: "booking_a" }),
        calendarEvent({
          public_id: "booking_b",
          space_public_id: "space_b",
          space_name: "Rochester Room",
          location_public_id: "loc_b",
          location_name: "Rochester",
        }),
      ].filter((event) => !locationPublicId || event.location_public_id === locationPublicId);

      await json(route, {
        start: url.searchParams.get("start") || "2026-06-01T00:00:00.000Z",
        end: url.searchParams.get("end") || "2026-06-02T00:00:00.000Z",
        truncated: false,
        spaces: spaces.filter((space) => !locationPublicId || space.location_public_id === locationPublicId),
        events,
      });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/member/calendar");
  await page.getByTestId("calendar-date-input").fill("2026-06-01");

  await expect(page.getByTestId("member-day-grid")).toBeVisible();
  await expect(page.getByTestId("calendar-event-booking_a")).toBeVisible();
  await expect(page.getByTestId("calendar-event-booking_b")).toBeVisible();
  await expect(page.getByText("Unused Room")).toHaveCount(0);

  const nineAm = await page.getByTestId("member-day-hour-9").boundingBox();
  const booking = await page.getByTestId("calendar-event-booking_a").boundingBox();
  expect(nineAm).not.toBeNull();
  expect(booking).not.toBeNull();
  expect(Math.abs((booking?.y || 0) - (nineAm?.y || 0))).toBeLessThan(20);

  await page.getByTestId("member-calendar-location-filter").selectOption("loc_b");

  await expect.poll(() =>
    calendarRequests.some((request) => request.searchParams.get("location_public_id") === "loc_b")
  ).toBe(true);
  await expect(page.getByTestId("calendar-event-booking_b")).toBeVisible();
  await expect(page.getByTestId("calendar-event-booking_a")).toHaveCount(0);
});
