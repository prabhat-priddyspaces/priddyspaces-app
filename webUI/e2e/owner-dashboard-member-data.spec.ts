import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

function withTime(base: Date, hours: number, minutes = 0) {
  const date = new Date(base);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function memberStats(first: Date, last: Date) {
  return {
    total_bookings: 2,
    confirmed_bookings: 2,
    canceled_bookings: 0,
    no_shows: 0,
    open_requests: 0,
    total_revenue_cents: 9800,
    active_subscriptions: 0,
    first_booking_at: first.toISOString(),
    last_booking_at: last.toISOString(),
  };
}

function calendarEvent({
  publicId,
  spacePublicId,
  spaceName,
  start,
  end,
}: {
  publicId: string;
  spacePublicId: string;
  spaceName: string;
  start: Date;
  end: Date;
}) {
  return {
    kind: "booking",
    public_id: publicId,
    space_public_id: spacePublicId,
    space_name: spaceName,
    space_type: "conference_room",
    location_public_id: "loc_1",
    location_name: "Downtown",
    start: start.toISOString(),
    end: end.toISOString(),
    status: "booking.confirmed",
    payment_status: "succeeded",
    member: { public_id: "member_1", name: "Test Member", email: "member@example.com" },
    amount_cents: 4900,
    checked_in: false,
    no_show: false,
    request_kind: null,
    plan_name: null,
  };
}

test("owner dashboard uses live calendar and payment data instead of sample cards", async ({ page }) => {
  const today = new Date();
  const eventStart = withTime(today, 10);
  const eventEnd = withTime(today, 11);

  await mockSession(page, "owner");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner", { first_name: "Owner" }));
      return;
    }
    if (key === "GET /api/assistant/status") {
      await json(route, { enabled: true, primary_model: "gpt-4o", summary_model: "gpt-4o-mini" });
      return;
    }
    if (key === "GET /api/booking-requests") {
      await json(route, []);
      return;
    }
    if (key === "GET /api/payments") {
      await json(route, [
        {
          amount: 49,
          amount_cents: 4900,
          refunded_amount_cents: 0,
          status: "succeeded",
          created_at: today.toISOString(),
          booking_id: 1,
          subscription_id: null,
        },
      ]);
      return;
    }
    if (key === "GET /api/invoices") {
      await json(route, [{ amount: 49, created_at: today.toISOString() }]);
      return;
    }
    if (key === "GET /api/orgs") {
      await json(route, [{ public_id: "org_1", name: "Downtown Cowork" }]);
      return;
    }
    if (key === "GET /api/subscriptions") {
      await json(route, []);
      return;
    }
    if (key === "GET /api/orgs/org_1/members") {
      await json(route, [{ public_id: "member_1" }]);
      return;
    }
    if (key === "GET /api/locations") {
      await json(route, [{ public_id: "loc_1", name: "Downtown", city: "Miami" }]);
      return;
    }
    if (key === "GET /api/locations/loc_1/spaces") {
      await json(route, [
        { public_id: "space_1", name: "Board Room", availability_status: "available" },
      ]);
      return;
    }
    if (key === "GET /api/owner/calendar") {
      await json(route, {
        start: withTime(today, 0).toISOString(),
        end: withTime(today, 23, 59).toISOString(),
        truncated: false,
        spaces: [
          {
            public_id: "space_1",
            name: "Board Room",
            space_type: "conference_room",
            location_public_id: "loc_1",
            location_name: "Downtown",
            location_timezone: "UTC",
          },
        ],
        events: [
          calendarEvent({
            publicId: "booking_today",
            spacePublicId: "space_1",
            spaceName: "Board Room",
            start: eventStart,
            end: eventEnd,
          }),
        ],
      });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner");

  await expect(page.getByText("Board Room")).toBeVisible();
  await expect(page.getByText("Test Member")).toBeVisible();
  await expect(page.getByText("Riverside 3")).toHaveCount(0);
  await expect(page.getByText("Foundry Co. · monthly")).toHaveCount(0);
  await expect(page.getByText("$49").first()).toBeVisible();

  await page.getByRole("button", { name: /Open assistant for dashboard suggestions/ }).click();
  await expect(page.getByText("Assistant", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Ask PriddySpaces...")).toHaveValue(
    "What should I prioritize on my owner dashboard today?",
  );
});

test("owner member detail shows member-scoped upcoming and past activity", async ({ page }) => {
  const now = new Date();
  const pastStart = withTime(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1), 10);
  const pastEnd = withTime(pastStart, 11);
  const futureStart = withTime(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), 12);
  const futureEnd = withTime(futureStart, 13);
  let calendarQuery: URL | null = null;

  await mockSession(page, "owner");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }
    if (key === "GET /api/assistant/status") {
      await json(route, { enabled: false, primary_model: "", summary_model: "" });
      return;
    }
    if (key === "GET /api/owner/members/member_1") {
      await json(route, {
        user_public_id: "member_1",
        organization_public_id: "org_1",
        name: "Test Member",
        email: "member@example.com",
        status: "active",
        phone: null,
        company_name: null,
        tags: [],
        notes: null,
        materialized: false,
        stats: memberStats(pastStart, futureStart),
      });
      return;
    }
    if (key === "GET /api/owner/calendar") {
      calendarQuery = url;
      await json(route, {
        start: pastStart.toISOString(),
        end: futureEnd.toISOString(),
        truncated: false,
        spaces: [],
        events: [
          calendarEvent({
            publicId: "booking_past",
            spacePublicId: "space_past",
            spaceName: "Past Room",
            start: pastStart,
            end: pastEnd,
          }),
          calendarEvent({
            publicId: "booking_future",
            spacePublicId: "space_future",
            spaceName: "Future Room",
            start: futureStart,
            end: futureEnd,
          }),
        ],
      });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/members/member_1");

  await expect(page.getByRole("heading", { name: "Test Member" })).toBeVisible();
  await expect.poll(() => calendarQuery?.searchParams.get("member_public_id")).toBe("member_1");

  await page.getByRole("button", { name: "Upcoming" }).click();
  await expect(page.getByText("Future Room")).toBeVisible();
  await expect(page.getByText("Past Room")).toHaveCount(0);

  await page.getByRole("button", { name: "Past" }).click();
  await expect(page.getByText("Past Room")).toBeVisible();
  await expect(page.getByText("Future Room")).toHaveCount(0);
});
