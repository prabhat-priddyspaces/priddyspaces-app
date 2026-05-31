import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("member can submit a booking request from a space detail page", async ({ page }) => {
  const bookingRequest = {
    public_id: "req_1",
    created_at: "2026-04-09T18:45:00.000Z",
    space_public_id: "space_1",
    space_name: "Conference 14-B",
    space_type: "conference_room",
    organization_name: "Downtown Cowork",
    location_public_id: "loc_1",
    location_name: "Downtown Hub",
    location_address: "100 Congress Ave",
    location_city: "Austin",
    location_state: "TX",
    location_postal_code: "78701",
    location_timezone: "America/Chicago",
    location_public_phone: "(512) 555-0142",
    location_public_email: "hello@downtownhub.test",
    support_contacts: [{ name: "Avery Host", title: "Owner" }],
    booking_id: 101,
    booking_public_id: "book_1",
    estimated_amount: 120,
    start_datetime: "2026-04-10T14:00:00.000Z",
    end_datetime: "2026-04-10T16:00:00.000Z",
    status: "approved",
    payment_status: "succeeded",
    payment_provider: "stripe",
    member_owner_payment_method_public_id: "pm_owner_1",
    approved_at: "2026-04-09T19:10:00.000Z",
    rejected_at: null,
    cancelled_at: null,
    cancellation_deadline_at: "2026-04-09T14:00:00.000Z",
    payment_hold_expires_at: null,
    payment_failed_at: null,
    booking_approval_mode: "auto",
    payment_failure_hold_minutes: 30,
    operator_notes: null,
  };

  await mockSession(page, "member");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("member"));
      return;
    }

    if (key === "GET /api/marketplace/spaces/space_1/availability") {
      // Pick a date a few days out so it is always "today or later" no matter
      // when CI runs and so the auto-populate logic finds a bookable slot.
      const todayIso = new Date().toISOString().slice(0, 10);
      await json(route, {
        space_public_id: "space_1",
        timezone: "America/Chicago",
        granularity_minutes: 60,
        availability_start_time: "09:00",
        availability_end_time: "18:00",
        buffer_before_minutes: 15,
        buffer_after_minutes: 15,
        hourly_price: 60,
        daily_price: 120,
        days: [
          {
            date: todayIso,
            fully_blocked: false,
            busy_intervals: [],
          },
        ],
      });
      return;
    }

    if (key === "GET /api/marketplace/spaces/space_1") {
      await json(route, {
        space: {
          public_id: "space_1",
          name: "Conference 14-B",
          space_type: "conference_room",
          capacity: 8,
          availability_status: "available",
          availability_start_time: "09:00:00",
          availability_end_time: "18:00:00",
          buffer_before_minutes: 15,
          buffer_after_minutes: 15,
          price_daily: 120,
          price_monthly: null,
          hourly_price: 60,
          membership_price: null,
          amenities: ["whiteboard", "coffee"],
        },
        images: [],
        location: {
          location_public_id: "loc_1",
          organization_name: "Downtown Cowork",
          booking_approval_mode: "auto",
          payment_failure_hold_minutes: 30,
          name: "Downtown Hub",
          address: "100 Congress Ave",
          city: "Austin",
          state: "TX",
          postal_code: "78701",
          neighborhood: "Downtown",
          timezone: "America/Chicago",
          lat: 30.2672,
          lng: -97.7431,
          public_phone: null,
          public_email: null,
          public_hours_weekdays: null,
          public_hours_weekends: null,
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

    if (key === "GET /api/payment-methods/resolve") {
      await json(route, {
        provider: "stripe",
        owner_payment_setting_public_id: "ops_1",
        organization_public_id: "org_1",
        is_configured: true,
        has_payment_method: true,
        payment_method_public_id: "pm_owner_1",
        publishable_key: "pk_test",
        tokenizer_url: null,
        message: null,
      });
      return;
    }

    if (key === "POST /api/booking-requests") {
      const payload = route.request().postDataJSON() as {
        start_datetime: string;
        end_datetime: string;
        booking_mode: string;
        full_day: boolean;
        member_owner_payment_method_public_id: string;
        payment_authorization_consent: boolean;
      };
      expect(payload.booking_mode).toBe("hourly");
      expect(payload.full_day).toBe(false);
      expect(payload.member_owner_payment_method_public_id).toBe("pm_owner_1");
      expect(payload.payment_authorization_consent).toBe(true);
      bookingRequest.start_datetime = payload.start_datetime;
      bookingRequest.end_datetime = payload.end_datetime;
      await json(route, bookingRequest);
      return;
    }

    if (key === "GET /api/booking-requests") {
      await json(route, [bookingRequest]);
      return;
    }

    if (key === "GET /api/booking-requests/req_1") {
      await json(route, bookingRequest);
      return;
    }

    if (key === "GET /api/payments") {
      await json(route, [
        {
          id: 501,
          public_id: "pay_req_1",
          amount: 120,
          status: "succeeded",
          booking_id: 101,
          subscription_id: null,
          created_at: "2026-04-10T16:01:00.000Z",
        },
      ]);
      return;
    }

    if (key === "GET /api/invoices") {
      await json(route, [
        {
          public_id: "inv_req_1",
          amount: 120,
          status: "paid",
          booking_id: 101,
          payment_id: 501,
          created_at: "2026-04-10T16:02:00.000Z",
        },
      ]);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/spaces/space_1");

  await expect(page.getByRole("heading", { name: "Conference 14-B" })).toBeVisible();

  // Auto-populate fills the date and a slot once availability resolves.
  await expect(page.getByRole("button", { name: "Reserve & Pay" })).toBeEnabled();
  await page.getByLabel("I authorize Downtown Cowork to charge my card now for this booking.").check();
  await page.getByRole("button", { name: "Reserve & Pay" }).click();

  await expect(page).toHaveURL(/\/member\/requests$/);
  await expect(page.getByText("Conference 14-B").first()).toBeVisible();
  await expect(page.getByText("Downtown Hub").first()).toBeVisible();
  await expect(page.getByText("Contact: Avery Host (Owner)")).toBeVisible();
  await expect(page.getByText(/Request sent:/)).toBeVisible();
  await expect(page.getByText("Status: approved")).toBeVisible();

  await page.getByRole("link", { name: "View booking request" }).click();

  await expect(page).toHaveURL(/\/member\/requests\/req_1$/);
  await expect(page.getByRole("heading", { name: "Request details" })).toBeVisible();
  await expect(page.getByText("Location: Downtown Hub")).toBeVisible();
  await expect(page.getByText("Avery Host · Owner")).toBeVisible();
  await expect(page.getByText(/Approved at/)).toBeVisible();
  await expect(page.getByText("Booking payment recorded")).toBeVisible();
  await expect(page.getByText("Invoice: inv_req_1")).toBeVisible();
});

test("member can submit an all-day conference booking without granularity blocking the day span", async ({ page }) => {
  const bookingRequest = {
    public_id: "req_all_day_1",
    created_at: "2099-05-31T18:45:00.000Z",
    space_public_id: "space_all_day_1",
    space_name: "Austin Conference Room",
    space_type: "conference_room",
    organization_name: "Aligned Cowork",
    location_public_id: "loc_all_day_1",
    location_name: "Austin Hub",
    location_address: "100 Congress Ave",
    location_city: "Austin",
    location_state: "TX",
    location_postal_code: "78701",
    location_timezone: "UTC",
    location_public_phone: null,
    location_public_email: null,
    support_contacts: [],
    booking_id: 303,
    booking_public_id: "book_all_day_1",
    estimated_amount: 350,
    start_datetime: "2099-06-01T09:00:00.000Z",
    end_datetime: "2099-06-01T18:30:00.000Z",
    status: "approved",
    payment_status: "succeeded",
    payment_provider: "stripe",
    member_owner_payment_method_public_id: "pm_owner_1",
    approved_at: "2099-05-31T19:10:00.000Z",
    rejected_at: null,
    cancelled_at: null,
    cancellation_deadline_at: "2099-05-31T09:00:00.000Z",
    payment_hold_expires_at: null,
    payment_failed_at: null,
    booking_approval_mode: "auto",
    payment_failure_hold_minutes: 30,
    operator_notes: null,
  };

  await mockSession(page, "member");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("member"));
      return;
    }

    if (key === "GET /api/marketplace/spaces/space_all_day_1/availability") {
      await json(route, {
        space_public_id: "space_all_day_1",
        timezone: "UTC",
        granularity_minutes: 120,
        availability_start_time: "09:00",
        availability_end_time: "18:30",
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        hourly_price: 40,
        daily_price: 350,
        days: [
          {
            date: "2099-06-01",
            fully_blocked: false,
            busy_intervals: [],
          },
        ],
      });
      return;
    }

    if (key === "GET /api/marketplace/spaces/space_all_day_1") {
      await json(route, {
        space: {
          public_id: "space_all_day_1",
          name: "Austin Conference Room",
          space_type: "conference_room",
          capacity: 8,
          availability_status: "available",
          availability_start_time: "09:00:00",
          availability_end_time: "18:30:00",
          buffer_before_minutes: 0,
          buffer_after_minutes: 0,
          price_daily: 350,
          price_monthly: null,
          hourly_price: 40,
          membership_price: null,
          amenities: ["whiteboard", "coffee"],
        },
        images: [],
        location: {
          location_public_id: "loc_all_day_1",
          organization_name: "Aligned Cowork",
          booking_approval_mode: "auto",
          payment_failure_hold_minutes: 30,
          name: "Austin Hub",
          address: "100 Congress Ave",
          city: "Austin",
          state: "TX",
          postal_code: "78701",
          neighborhood: "Downtown",
          timezone: "UTC",
          lat: 30.2672,
          lng: -97.7431,
          public_phone: null,
          public_email: null,
          public_hours_weekdays: null,
          public_hours_weekends: null,
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
        reason: "Rewards are not available for this booking",
        organization_public_id: "org_all_day_1",
        wallet_public_id: null,
        promo_balance: 0,
        earned_balance: 0,
        total_balance: 0,
        point_value_cents: 1,
        subtotal_cents: 35000,
        max_redeemable_points: 0,
        max_discount_cents: 0,
        requested_points: 0,
        discount_cents: 0,
        priddy: {
          eligible: false,
          reason: "Rewards are not available for this booking",
          balance: 0,
          point_value_cents: 1,
          max_redeemable_points: 0,
          requested_points: 0,
          discount_cents: 0,
        },
        owner: {
          eligible: false,
          reason: "No owner points available",
          balance: 0,
          point_value_cents: 1,
          max_redeemable_points: 0,
          requested_points: 0,
          discount_cents: 0,
        },
      });
      return;
    }

    if (key === "GET /api/payment-methods/resolve") {
      await json(route, {
        provider: "stripe",
        owner_payment_setting_public_id: "ops_1",
        organization_public_id: "org_all_day_1",
        is_configured: true,
        has_payment_method: true,
        payment_method_public_id: "pm_owner_1",
        publishable_key: "pk_test",
        tokenizer_url: null,
        message: null,
      });
      return;
    }

    if (key === "POST /api/booking-requests") {
      const payload = route.request().postDataJSON() as {
        start_datetime: string;
        end_datetime: string;
        booking_mode: string;
        full_day: boolean;
        member_owner_payment_method_public_id: string;
        payment_authorization_consent: boolean;
      };
      expect(payload.booking_mode).toBe("day_pass");
      expect(payload.full_day).toBe(true);
      expect(payload.start_datetime).toBe("2099-06-01T09:00:00.000Z");
      expect(payload.end_datetime).toBe("2099-06-01T18:30:00.000Z");
      expect(payload.member_owner_payment_method_public_id).toBe("pm_owner_1");
      expect(payload.payment_authorization_consent).toBe(true);
      await json(route, bookingRequest);
      return;
    }

    if (key === "GET /api/booking-requests") {
      await json(route, [bookingRequest]);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/spaces/space_all_day_1");

  await expect(page.getByRole("heading", { name: "Austin Conference Room" })).toBeVisible();
  await page.getByLabel("All day").check();
  await page.getByLabel("I authorize Aligned Cowork to charge my card now for this booking.").check();
  await page.getByRole("button", { name: "Reserve & Pay" }).click();

  await expect(page).toHaveURL(/\/member\/requests$/);
  await expect(page.getByText("Austin Conference Room").first()).toBeVisible();
});

test("member can redeem Priddy Points for a full day pass without a card", async ({ page }) => {
  const bookingRequest = {
    public_id: "req_points_1",
    created_at: "2026-04-09T18:45:00.000Z",
    space_public_id: "space_points_1",
    space_name: "Open Desk Day Pass",
    space_type: "shared_desk",
    location_public_id: "loc_points_1",
    location_name: "Rewards Hub",
    location_address: "200 Market St",
    location_city: "Miami",
    location_state: "FL",
    location_postal_code: "33131",
    location_timezone: "America/New_York",
    location_public_phone: null,
    location_public_email: null,
    support_contacts: [],
    booking_id: 202,
    booking_public_id: "book_points_1",
    estimated_amount: 10,
    start_datetime: "2026-04-10T13:00:00.000Z",
    end_datetime: "2026-04-10T22:00:00.000Z",
    status: "approved",
    payment_status: "succeeded",
    payment_provider: "points",
    member_owner_payment_method_public_id: null,
    approved_at: "2026-04-09T19:10:00.000Z",
    rejected_at: null,
    cancelled_at: null,
    cancellation_deadline_at: "2026-04-09T14:00:00.000Z",
    operator_notes: null,
  };
  let paymentResolveCalls = 0;

  await mockSession(page, "member");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("member"));
      return;
    }

    if (key === "GET /api/marketplace/spaces/space_points_1/availability") {
      const todayIso = new Date().toISOString().slice(0, 10);
      await json(route, {
        space_public_id: "space_points_1",
        timezone: "America/New_York",
        granularity_minutes: 60,
        availability_start_time: "09:00",
        availability_end_time: "18:00",
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        hourly_price: null,
        daily_price: 10,
        days: [
          {
            date: todayIso,
            fully_blocked: false,
            busy_intervals: [],
          },
        ],
      });
      return;
    }

    if (key === "GET /api/marketplace/spaces/space_points_1") {
      await json(route, {
        space: {
          public_id: "space_points_1",
          name: "Open Desk Day Pass",
          space_type: "shared_desk",
          capacity: 1,
          availability_status: "available",
          availability_start_time: "09:00:00",
          availability_end_time: "18:00:00",
          buffer_before_minutes: 0,
          buffer_after_minutes: 0,
          price_daily: 10,
          price_monthly: null,
          hourly_price: null,
          membership_price: null,
          amenities: ["WiFi", "Coffee"],
        },
        images: [],
        location: {
          location_public_id: "loc_points_1",
          organization_name: "Rewards Hub",
          booking_approval_mode: "auto",
          payment_failure_hold_minutes: 30,
          name: "Rewards Hub",
          address: "200 Market St",
          city: "Miami",
          state: "FL",
          postal_code: "33131",
          neighborhood: "Brickell",
          timezone: "America/New_York",
          lat: 25.7616,
          lng: -80.1918,
          public_phone: null,
          public_email: null,
          public_hours_weekdays: null,
          public_hours_weekends: null,
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
        eligible: true,
        reason: null,
        organization_public_id: "org_points_1",
        wallet_public_id: "wallet_points_1",
        promo_balance: 0,
        earned_balance: 0,
        total_balance: 0,
        point_value_cents: 1,
        subtotal_cents: 1000,
        max_redeemable_points: 1000,
        max_discount_cents: 1000,
        requested_points: 0,
        discount_cents: 0,
        priddy: {
          eligible: true,
          reason: null,
          balance: 1000,
          point_value_cents: 1,
          max_redeemable_points: 1000,
          requested_points: 0,
          discount_cents: 0,
        },
        owner: {
          eligible: false,
          reason: "No owner points available",
          balance: 0,
          point_value_cents: 1,
          max_redeemable_points: 0,
          requested_points: 0,
          discount_cents: 0,
        },
      });
      return;
    }

    if (key === "POST /api/loyalty/redemptions/lock") {
      const payload = route.request().postDataJSON() as {
        booking_mode: string;
        full_day: boolean;
        priddy_points_requested: number;
        owner_points_requested: number;
      };
      expect(payload.booking_mode).toBe("day_pass");
      expect(payload.full_day).toBe(true);
      expect(payload.priddy_points_requested).toBe(1000);
      expect(payload.owner_points_requested).toBe(0);
      await json(route, {
        public_id: "lock_points_1",
        organization_public_id: "org_points_1",
        points: 1000,
        priddy_points: 1000,
        promo_points: 0,
        earned_points: 0,
        discount_cents: 1000,
        status: "active",
        expires_at: "2026-04-09T19:15:00.000Z",
      });
      return;
    }

    if (key === "GET /api/payment-methods/resolve") {
      paymentResolveCalls += 1;
      await json(route, { detail: "Payment method should not be resolved for fully covered points bookings" }, 500);
      return;
    }

    if (key === "POST /api/booking-requests") {
      const payload = route.request().postDataJSON() as {
        booking_mode: string;
        full_day: boolean;
        member_owner_payment_method_public_id: string | null;
        payment_authorization_consent: boolean;
        redemption_lock_public_id: string;
      };
      expect(payload.booking_mode).toBe("day_pass");
      expect(payload.full_day).toBe(true);
      expect(payload.member_owner_payment_method_public_id).toBeNull();
      expect(payload.payment_authorization_consent).toBe(true);
      expect(payload.redemption_lock_public_id).toBe("lock_points_1");
      await json(route, bookingRequest);
      return;
    }

    if (key === "GET /api/booking-requests") {
      await json(route, [bookingRequest]);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/spaces/space_points_1");

  await expect(page.getByRole("heading", { name: "Open Desk Day Pass" })).toBeVisible();
  await expect(page.getByLabel("Seats")).toHaveValue("1");
  await expect(page.getByText("Priddy Points: 1,000 available, up to 1,000")).toBeVisible();
  await expect(page.getByText("Rewards savings")).toBeVisible();
  await expect(page.getByText("$10").last()).toBeVisible();

  await page.getByRole("button", { name: "Reserve & Pay" }).click();

  await expect(page).toHaveURL(/\/member\/requests$/);
  await expect(page.getByText("Open Desk Day Pass").first()).toBeVisible();
  expect(paymentResolveCalls).toBe(0);
});
