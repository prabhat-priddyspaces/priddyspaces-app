import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("member can submit a booking request from a space detail page", async ({ page }) => {
  const bookingRequest = {
    public_id: "req_1",
    space_public_id: "space_1",
    booking_id: 101,
    booking_public_id: "book_1",
    estimated_amount: 120,
    start_datetime: "2026-04-10T14:00:00.000Z",
    end_datetime: "2026-04-10T16:00:00.000Z",
    status: "approved",
    payment_status: "succeeded",
    payment_provider: "stripe",
    member_owner_payment_method_public_id: "pm_owner_1",
    cancellation_deadline_at: "2026-04-09T14:00:00.000Z",
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

    if (key === "GET /api/subscription-plans/public") {
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

  await page.goto("/spaces/_?id=space_1");

  await expect(page.getByRole("heading", { name: "Conference 14-B" })).toBeVisible();

  // Auto-populate fills the date and a slot once availability resolves.
  await expect(page.getByRole("button", { name: "Reserve & Pay" })).toBeEnabled();
  await page.getByLabel("I authorize this owner to charge my card now for instant bookings or upon approval for request-to-book spaces.").check();
  await page.getByRole("button", { name: "Reserve & Pay" }).click();

  await expect(page).toHaveURL(/\/member\/requests$/);
  await expect(page.getByText("Status:")).toBeVisible();
  await expect(page.getByText("approved")).toBeVisible();

  await page.getByRole("link", { name: "View details" }).click();

  await expect(page).toHaveURL(/\/member\/requests\/_\?id=req_1$/);
  await expect(page.getByText("Request details")).toBeVisible();
  await expect(page.getByText("Payment: pay_req_1")).toBeVisible();
  await expect(page.getByText("Invoice: inv_req_1")).toBeVisible();
});
