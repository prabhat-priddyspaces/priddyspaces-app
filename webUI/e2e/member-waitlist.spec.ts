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

test("member joins a conference room waitlist when that type is enabled", async ({ page }) => {
  await mockSession(page, "member");
  const date = "2026-06-15";
  const waitlistEntry = {
    public_id: "wait_conf_1",
    created_at: "2026-06-01T14:00:00.000Z",
    status: "waitlisted",
    space_public_id: "space_conf_wait",
    space_name: "Conference 14-B",
    space_type: "conference_room",
    organization_name: "Harbor Rooms",
    location_name: "Harbor Rooms",
    location_city: "Tampa",
    membership_plan_name: null,
    request_kind: "hourly_booking",
    booking_mode: "hourly",
    seats_requested: 1,
    start_datetime: `${date}T14:00:00.000Z`,
    end_datetime: `${date}T15:00:00.000Z`,
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
    if (key === "GET /api/marketplace/spaces/space_conf_wait/availability") {
      await json(route, {
        space_public_id: "space_conf_wait",
        timezone: "UTC",
        granularity_minutes: 60,
        availability_start_time: "14:00",
        availability_end_time: "17:00",
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        hourly_price: 60,
        daily_price: 220,
        waitlist_enabled: true,
        waitlist_conference_room_enabled: true,
        waitlist_private_office_enabled: false,
        waitlist_shared_desk_enabled: false,
        waitlist_suite_enabled: false,
        waitlist_virtual_office_enabled: false,
        days: [
          {
            date,
            fully_blocked: false,
            capacity: null,
            booked_seats: null,
            remaining_seats: null,
            busy_intervals: [{ start: "14:00", end: "15:00" }],
          },
        ],
      });
      return;
    }
    if (key === "GET /api/marketplace/spaces/space_conf_wait") {
      await json(route, {
        space: {
          public_id: "space_conf_wait",
          name: "Conference 14-B",
          space_type: "conference_room",
          capacity: 8,
          availability_status: "available",
          availability_start_time: "14:00:00",
          availability_end_time: "17:00:00",
          buffer_before_minutes: 0,
          buffer_after_minutes: 0,
          price_daily: 220,
          price_monthly: null,
          hourly_price: 60,
          membership_price: null,
          amenities: ["WiFi"],
          booking_products: [],
        },
        images: [],
        location: {
          location_public_id: "loc_conf_wait",
          organization_name: "Harbor Rooms",
          booking_approval_mode: "manual",
          membership_lease_approval_mode: "manual",
          payment_failure_hold_minutes: 30,
          waitlist_enabled: true,
          waitlist_conference_room_enabled: true,
          waitlist_private_office_enabled: false,
          waitlist_shared_desk_enabled: false,
          waitlist_suite_enabled: false,
          waitlist_virtual_office_enabled: false,
          name: "Harbor Rooms",
          address: "615 Channelside Dr",
          city: "Tampa",
          state: "FL",
          postal_code: "33602",
          neighborhood: "Channelside",
          timezone: "UTC",
          lat: 27.9506,
          lng: -82.4572,
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
    if (key === "POST /api/booking-waitlist") {
      const payload = route.request().postDataJSON() as {
        space_public_id: string;
        booking_mode: string;
        full_day: boolean;
      };
      expect(payload.space_public_id).toBe("space_conf_wait");
      expect(payload.booking_mode).toBe("hourly");
      expect(payload.full_day).toBe(false);
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

  await page.goto(`/spaces/space_conf_wait?date=${date}&start_time=14:00&end_time=15:00`);

  await expect(page.getByRole("heading", { name: "Conference 14-B" })).toBeVisible();
  await page.getByRole("button", { name: "Join waitlist" }).click();

  await expect(page).toHaveURL(/\/member\/requests$/);
  await expect(page.getByText("Waitlist • Conference Room • Harbor Rooms • Tampa")).toBeVisible();
});

test("member joins a private office lease waitlist when that type is enabled", async ({ page }) => {
  await mockSession(page, "member");
  const moveInDate = "2026-06-15";
  const waitlistEntry = {
    public_id: "wait_private_1",
    created_at: "2026-06-01T14:00:00.000Z",
    status: "waitlisted",
    space_public_id: "space_private_wait",
    space_name: "Private Office 501",
    space_type: "private_office",
    organization_name: "Brickell Commons",
    location_name: "Brickell Commons",
    location_city: "Miami",
    membership_plan_name: "12-month Term",
    request_kind: "lease_purchase",
    booking_mode: "private_office_lease",
    seats_requested: 1,
    start_datetime: `${moveInDate}T00:00:00.000Z`,
    end_datetime: "2027-06-15T00:00:00.000Z",
    desired_start_date: moveInDate,
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
    if (key === "GET /api/marketplace/spaces/space_private_wait/availability") {
      await json(route, {
        space_public_id: "space_private_wait",
        timezone: "UTC",
        granularity_minutes: 60,
        availability_start_time: "09:00",
        availability_end_time: "17:00",
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        hourly_price: null,
        daily_price: null,
        waitlist_enabled: true,
        waitlist_conference_room_enabled: false,
        waitlist_private_office_enabled: true,
        waitlist_shared_desk_enabled: false,
        waitlist_suite_enabled: false,
        waitlist_virtual_office_enabled: false,
        days: [
          {
            date: moveInDate,
            fully_blocked: true,
            capacity: null,
            booked_seats: null,
            remaining_seats: null,
            busy_intervals: [{ start: "09:00", end: "17:00" }],
          },
        ],
      });
      return;
    }
    if (key === "GET /api/marketplace/spaces/space_private_wait") {
      await json(route, {
        space: {
          public_id: "space_private_wait",
          name: "Private Office 501",
          space_type: "private_office",
          capacity: 4,
          availability_status: "available",
          availability_start_time: "09:00:00",
          availability_end_time: "17:00:00",
          buffer_before_minutes: 0,
          buffer_after_minutes: 0,
          price_daily: null,
          price_monthly: 1800,
          hourly_price: null,
          membership_price: 1799,
          amenities: ["WiFi"],
          booking_products: [
            {
              product_type: "lease",
              booking_mode: "private_office_lease",
              label: "12-month Term",
              price: null,
              price_cents: 179900,
              membership_plan_public_id: "plan_private_wait",
              billing_cycle: "monthly",
              commitment_months: 12,
              seats_per_plan: 1,
              space_capacity: 4,
              available_seats: 0,
              included_meeting_room_hours_per_month: 0,
              overage_hourly_rate_cents: null,
            },
          ],
        },
        images: [],
        location: {
          location_public_id: "loc_private_wait",
          organization_name: "Brickell Commons",
          booking_approval_mode: "manual",
          membership_lease_approval_mode: "manual",
          payment_failure_hold_minutes: 30,
          waitlist_enabled: true,
          waitlist_conference_room_enabled: false,
          waitlist_private_office_enabled: true,
          waitlist_shared_desk_enabled: false,
          waitlist_suite_enabled: false,
          waitlist_virtual_office_enabled: false,
          name: "Brickell Commons",
          address: "200 Brickell Ave",
          city: "Miami",
          state: "FL",
          postal_code: "33131",
          neighborhood: "Brickell",
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
      await json(route, [
        {
          public_id: "plan_private_wait",
          booking_mode: "private_office_lease",
          name: "12-month Term",
          description: null,
          price_cents: 179900,
          billing_cycle: "monthly",
          commitment_months: 12,
          auto_renew: false,
          included_meeting_room_hours_per_month: 0,
          overage_hourly_rate_cents: null,
          seats_per_plan: 1,
          max_active_subscriptions: 1,
          active_subscription_count: 1,
          available_seats: 0,
        },
      ]);
      return;
    }
    if (key === "POST /api/booking-waitlist") {
      const payload = route.request().postDataJSON() as {
        membership_plan_public_id: string;
        desired_start_date: string;
      };
      expect(payload.membership_plan_public_id).toBe("plan_private_wait");
      expect(payload.desired_start_date).toBe(moveInDate);
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

  await page.goto(`/spaces/space_private_wait?move_in=${moveInDate}`);

  await expect(page.getByRole("heading", { name: "Private Office 501" })).toBeVisible();
  await expect(page.getByText(/Currently leased/)).toBeVisible();
  await page.getByRole("button", { name: "Join waitlist" }).click();

  await expect(page).toHaveURL(/\/member\/requests$/);
  await expect(page.getByText("Waitlist • Private Office • Brickell Commons • Miami")).toBeVisible();
});
