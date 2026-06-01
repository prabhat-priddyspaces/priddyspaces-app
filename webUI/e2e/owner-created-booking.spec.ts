import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

const location = {
  public_id: "loc_1",
  organization_public_id: "org_1",
  name: "Austin Hub",
  city: "Austin",
  timezone: "UTC",
  status: "active",
};

const space = {
  public_id: "space_1",
  name: "Board Room",
  space_type: "conference_room",
  capacity: 6,
  price_hourly: 50,
  price_daily: 300,
  availability_status: "available",
  availability_start_time: "09:00:00",
  availability_end_time: "18:00:00",
};

function calendarPayload(events: unknown[], start: string, end: string) {
  return {
    start,
    end,
    truncated: false,
    spaces: [
      {
        public_id: "space_1",
        name: "Board Room",
        space_type: "conference_room",
        location_public_id: "loc_1",
        location_name: "Austin Hub",
        location_timezone: "UTC",
      },
    ],
    events,
  };
}

async function routeOwnerBookingApis(page: any, state: { cashCreated?: boolean; linkCreated?: boolean; paid?: boolean }) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (url.pathname.startsWith("/api/booking-payment-links/")) {
      await route.fallback();
      return;
    }

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }
    if (key === "GET /api/orgs") {
      await json(route, [{ public_id: "org_1", name: "Owner Org" }]);
      return;
    }
    if (key === "GET /api/locations") {
      await json(route, [location]);
      return;
    }
    if (key === "GET /api/locations/loc_1/spaces") {
      await json(route, [space]);
      return;
    }
    if (key === "GET /api/owner/spaces/space_1/availability") {
      await json(route, {
        space_public_id: "space_1",
        timezone: "UTC",
        granularity_minutes: 60,
        availability_start_time: "09:00:00",
        availability_end_time: "18:00:00",
        days: [{ date: "2026-07-15", busy_intervals: [] }],
      });
      return;
    }
    if (key === "POST /api/owner/bookings/preview") {
      await json(route, {
        currency: "usd",
        base_amount_cents: 10000,
        discount_amount_cents: 0,
        tax_amount_cents: 0,
        total_amount_cents: 10000,
        original_total_amount_cents: null,
        override_applied: false,
        rate_basis: "hourly",
        units: 2,
        quantity: 1,
      });
      return;
    }
    if (key === "POST /api/owner/bookings") {
      const body = route.request().postDataJSON() as { payment_collection_mode: string; member?: { email: string; full_name: string } };
      if (body.payment_collection_mode === "cash_collected") state.cashCreated = true;
      if (body.payment_collection_mode === "payment_link") state.linkCreated = true;
      await json(route, {
        request_public_id: body.payment_collection_mode === "cash_collected" ? "req_cash_1" : "req_link_1",
        booking_public_id: body.payment_collection_mode === "cash_collected" ? "booking_cash_1" : "booking_hold_1",
        status: body.payment_collection_mode === "cash_collected" ? "approved" : "requested",
        payment_status: body.payment_collection_mode === "cash_collected" ? "succeeded" : "payment_link_sent",
        payment_collection_mode: body.payment_collection_mode,
        member_public_id: "member_walkin",
        member_email: body.member?.email || "walkin@example.com",
        member_name: body.member?.full_name || "Walk In",
        total_amount_cents: 10000,
        payment_link_url:
          body.payment_collection_mode === "payment_link"
            ? "http://127.0.0.1:3001/booking-payment/link_token_1"
            : null,
        payment_link_expires_at:
          body.payment_collection_mode === "payment_link" ? "2026-07-15T12:30:00.000Z" : null,
        registration_url: "/sign-up?email=walkin%40example.com&redirect_url=%2Fmember%2Frequests%2Freq_link_1",
      });
      return;
    }
    if (key === "GET /api/owner/calendar") {
      const windowStart = new Date(url.searchParams.get("start") || "2026-06-01T00:00:00.000Z");
      const windowEnd = new Date(url.searchParams.get("end") || windowStart.getTime() + 3 * 24 * 60 * 60 * 1000);
      const eventStart = new Date(windowStart.getTime() + 10 * 60 * 60 * 1000).toISOString();
      const eventEnd = new Date(windowStart.getTime() + 12 * 60 * 60 * 1000).toISOString();
      const events = [];
      if (state.cashCreated) {
        events.push({
          kind: "booking",
          public_id: "booking_cash_1",
          space_public_id: "space_1",
          space_name: "Board Room",
          space_type: "conference_room",
          location_public_id: "loc_1",
          location_name: "Austin Hub",
          start: eventStart,
          end: eventEnd,
          status: "booking.confirmed",
          payment_status: "succeeded",
          member: { public_id: "member_walkin", name: "Walk In", email: "walkin@example.com" },
          amount_cents: 10000,
          checked_in: null,
          no_show: null,
          request_kind: "hourly_booking",
          plan_name: null,
        });
      }
      if (state.linkCreated) {
        events.push({
          kind: state.paid ? "booking" : "request",
          public_id: state.paid ? "booking_hold_1" : "req_link_1",
          space_public_id: "space_1",
          space_name: "Board Room",
          space_type: "conference_room",
          location_public_id: "loc_1",
          location_name: "Austin Hub",
          start: eventStart,
          end: eventEnd,
          status: state.paid ? "booking.confirmed" : "request.requested",
          payment_status: state.paid ? "succeeded" : "payment_link_sent",
          member: { public_id: "member_walkin", name: "Walk In", email: "walkin@example.com" },
          amount_cents: 10000,
          checked_in: null,
          no_show: null,
          request_kind: "hourly_booking",
          plan_name: null,
        });
      }
      await json(route, calendarPayload(events, windowStart.toISOString(), windowEnd.toISOString()));
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });
}

async function fillNewMemberBooking(page: any) {
  await page.getByTestId("owner-booking-date").fill("2026-07-15");
  await page.getByTestId("owner-booking-member-new").click();
  await page.getByTestId("owner-booking-new-name").fill("Walk In");
  await page.getByTestId("owner-booking-new-email").fill("walkin@example.com");
}

test("owner creates a cash booking and sees it on the calendar", async ({ page }) => {
  const state: { cashCreated?: boolean } = {};
  await mockSession(page, "owner");
  await routeOwnerBookingApis(page, state);

  await page.goto("/owner/bookings/new");

  await expect(page.getByRole("heading", { name: "Create booking" })).toBeVisible();
  await fillNewMemberBooking(page);
  await page.getByTestId("owner-booking-preview-button").click();
  await expect(page.getByText("$100.00").first()).toBeVisible();
  await page.getByTestId("owner-booking-submit-button").click();
  await expect(page.getByText("Cash booking confirmed")).toBeVisible();

  await page.goto("/owner/calendar");
  await expect(page.getByText("Board Room").last()).toBeVisible();
  await expect(page.getByText("1 booked", { exact: true }).first()).toBeVisible();
  await page.getByText("1 booked", { exact: true }).first().click();
  await expect(page.getByText("Walk In").first()).toBeVisible();
});

test("owner sends a payment link and the pending hold appears", async ({ page }) => {
  const state: { linkCreated?: boolean } = {};
  await mockSession(page, "owner");
  await routeOwnerBookingApis(page, state);

  await page.goto("/owner/bookings/new");

  await fillNewMemberBooking(page);
  await page.getByTestId("owner-booking-payment-link").click();
  await page.getByTestId("owner-booking-submit-button").click();
  await expect(page.getByText("Payment link sent")).toBeVisible();
  await expect(page.getByText(/Hold expires/)).toBeVisible();

  await page.goto("/owner/calendar");
  await expect(page.getByText("Board Room").last()).toBeVisible();
  await expect(page.getByText("1 pending", { exact: true }).first()).toBeVisible();
  await page.getByText("1 pending", { exact: true }).first().click();
  await expect(page.getByText("Walk In").first()).toBeVisible();
  await expect(page.getByText("1 events")).toBeVisible();
});

test("public payment link completes payment and the booking becomes confirmed", async ({ page }) => {
  const state = { linkCreated: true, paid: false };
  await routeOwnerBookingApis(page, state);
  await page.route("**/api/booking-payment-links/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;
    if (key === "GET /api/booking-payment-links/link_token_1") {
      await json(route, {
        public_id: "link_1",
        status: "sent",
        expires_at: "2026-07-15T12:30:00.000Z",
        request_public_id: "req_link_1",
        booking_public_id: "booking_hold_1",
        space_name: "Board Room",
        location_name: "Austin Hub",
        start_datetime: "2026-07-15T10:00:00.000Z",
        end_datetime: "2026-07-15T12:00:00.000Z",
        member_email: "walkin@example.com",
        member_name: "Walk In",
        amount_cents: 10000,
        currency: "usd",
        provider: "cardpointe",
        publishable_key: null,
        tokenizer_url: "https://tokenizer.test",
      });
      return;
    }
    if (key === "POST /api/booking-payment-links/link_token_1/cardpointe-charge") {
      state.paid = true;
      await json(route, {
        status: "succeeded",
        request_public_id: "req_link_1",
        booking_public_id: "booking_hold_1",
        payment_public_id: "pay_1",
      });
      return;
    }
    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/booking-payment/link_token_1");

  await expect(page.getByRole("heading", { name: "Complete your booking payment" })).toBeVisible();
  await page.evaluate(() => {
    window.postMessage(
      JSON.stringify({ token: "card_token_1", last4: "4242", expiration: "1230" }),
      "*",
    );
  });
  await page.getByTestId("booking-payment-cardpointe-pay-button").click();
  await expect(page.getByText("Payment complete", { exact: true })).toBeVisible();

  await mockSession(page, "owner");
  await page.goto("/owner/calendar");
  await expect(page.getByText("1 booked", { exact: true }).first()).toBeVisible();
  await page.getByText("1 booked", { exact: true }).first().click();
  await expect(page.getByText("Walk In")).toBeVisible();
});
