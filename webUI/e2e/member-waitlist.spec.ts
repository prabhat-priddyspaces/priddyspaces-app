import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("member joins a waitlist for a sold-out day-pass space", async ({ page }) => {
  await mockSession(page, "member");
  const todayIso = new Date().toISOString().slice(0, 10);
  const waitlistEntry = {
    public_id: "wait_1",
    created_at: "2026-06-01T14:00:00.000Z",
    status: "waitlisted",
    space_public_id: "space_wait",
    space_name: "Open Desk A1",
    space_type: "shared_desk",
    organization_name: "Brickell Commons",
    location_name: "Brickell Commons",
    location_city: "Miami",
    membership_plan_name: null,
    request_kind: "daily_booking",
    booking_mode: "day_pass",
    seats_requested: 1,
    start_datetime: `${todayIso}T09:00:00.000Z`,
    end_datetime: `${todayIso}T17:00:00.000Z`,
    desired_start_date: null,
    invited_at: null,
    invite_expires_at: null,
    booking_href: null,
  };

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("member"));
      return;
    }

    if (key === "GET /api/marketplace/spaces/space_wait/availability") {
      await json(route, {
        space_public_id: "space_wait",
        timezone: "UTC",
        granularity_minutes: 60,
        availability_start_time: "09:00",
        availability_end_time: "17:00",
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        hourly_price: null,
        daily_price: 49,
        waitlist_enabled: true,
        days: [
          {
            date: todayIso,
            fully_blocked: true,
            capacity: 4,
            booked_seats: 4,
            remaining_seats: 0,
            busy_intervals: [{ start: "09:00", end: "17:00" }],
          },
        ],
      });
      return;
    }

    if (key === "GET /api/marketplace/spaces/space_wait") {
      await json(route, {
        space: {
          public_id: "space_wait",
          name: "Open Desk A1",
          space_type: "shared_desk",
          capacity: 4,
          availability_status: "available",
          availability_start_time: "09:00:00",
          availability_end_time: "17:00:00",
          buffer_before_minutes: 0,
          buffer_after_minutes: 0,
          price_daily: 49,
          price_monthly: null,
          hourly_price: null,
          membership_price: null,
          amenities: ["WiFi"],
          booking_products: [],
        },
        images: [],
        location: {
          location_public_id: "loc_wait",
          organization_name: "Brickell Commons",
          booking_approval_mode: "manual",
          membership_lease_approval_mode: "manual",
          payment_failure_hold_minutes: 30,
          waitlist_enabled: true,
          name: "Brickell Commons",
          address: "100 Main St",
          city: "Miami",
          state: "FL",
          postal_code: "33101",
          neighborhood: "Downtown",
          timezone: "UTC",
          lat: 25.7616,
          lng: -80.1918,
          public_phone: null,
          public_email: null,
          public_hours_weekdays: null,
          public_hours_weekends: null,
          public_working_hours_enabled: false,
          public_working_hours: [],
          public_parking_notes: [],
          public_transit_notes: [],
          public_included_items: [],
        },
        cancellation_policy: null,
        support_contacts: [],
      });
      return;
    }

    if (key === "GET /api/membership-plans/public") {
      await json(route, []);
      return;
    }

    if (key === "POST /api/loyalty/redemptions/preview") {
      await json(route, {
        eligible: false,
        reason: "No rewards available",
        organization_public_id: null,
        wallet_public_id: null,
        promo_balance: 0,
        earned_balance: 0,
        total_balance: 0,
        point_value_cents: 1,
        subtotal_cents: 4900,
        max_redeemable_points: 0,
        max_discount_cents: 0,
        requested_points: 0,
        discount_cents: 0,
        priddy: {
          eligible: false,
          reason: "No rewards available",
          balance: 0,
          point_value_cents: 1,
          max_redeemable_points: 0,
          requested_points: 0,
          discount_cents: 0,
        },
        owner: {
          eligible: false,
          reason: "No rewards available",
          balance: 0,
          point_value_cents: 1,
          max_redeemable_points: 0,
          requested_points: 0,
          discount_cents: 0,
        },
      });
      return;
    }

    if (key === "POST /api/booking-waitlist") {
      const payload = route.request().postDataJSON() as {
        space_public_id: string;
        booking_mode: string;
        full_day: boolean;
        seats_requested: number;
      };
      expect(payload.space_public_id).toBe("space_wait");
      expect(payload.booking_mode).toBe("day_pass");
      expect(payload.full_day).toBe(true);
      expect(payload.seats_requested).toBe(1);
      await json(route, waitlistEntry);
      return;
    }

    if (key === "GET /api/booking-requests") {
      await json(route, []);
      return;
    }

    if (key === "GET /api/booking-waitlist") {
      await json(route, [waitlistEntry]);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto(`/spaces/space_wait?date=${todayIso}`);

  await expect(page.getByRole("heading", { name: "Open Desk A1" })).toBeVisible();
  await expect(page.getByText("Sold out for the selected day.")).toBeVisible();
  await page.getByRole("button", { name: "Join waitlist" }).click();

  await expect(page).toHaveURL(/\/member\/requests$/);
  await expect(page.getByText("Waitlist • Shared Desk • Brickell Commons • Miami")).toBeVisible();
  await expect(page.getByText("Status: waitlisted")).toBeVisible();
});
