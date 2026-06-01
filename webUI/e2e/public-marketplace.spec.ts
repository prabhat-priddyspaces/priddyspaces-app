import { expect, test } from "@playwright/test";

import { json } from "./helpers/mock-api";

const coworkingResults = {
  meta: {
    total_locations: 2,
    page: 1,
    page_size: 20,
  },
  results: [
    {
      location_public_id: "loc_public_1",
      name: "Brickell Commons",
      address: "200 Brickell Ave",
      city: "Miami",
      state: "FL",
      postal_code: "33131",
      neighborhood: "Brickell",
      timezone: "America/New_York",
      lat: 25.7616,
      lng: -80.1918,
      featured_image_url: "https://images.example.com/brickell.jpg",
      location_amenities: ["Coffee", "WiFi"],
      matching_space_count: 2,
      featured_space_public_id: "space_public_1",
      starting_day_pass_price: 69,
      starting_monthly_price: null,
      starting_hourly_price: null,
      starting_membership_price: 299,
      spaces: [
        {
          public_id: "space_public_1",
          name: "Open Desk A1",
          space_type: "shared_desk",
          capacity: 1,
          availability_status: "available",
          availability_start_time: "08:00:00",
          availability_end_time: "18:00:00",
          price_daily: 69,
          price_monthly: null,
          hourly_price: null,
          membership_price: 299,
          amenities: ["Coffee", "WiFi"],
          image_url: "https://images.example.com/brickell.jpg",
        },
        {
          public_id: "space_public_2",
          name: "Open Desk B4",
          space_type: "shared_desk",
          capacity: 3,
          availability_status: "available",
          availability_start_time: "08:00:00",
          availability_end_time: "18:00:00",
          price_daily: 79,
          price_monthly: null,
          hourly_price: null,
          membership_price: 299,
          amenities: ["Coffee", "WiFi"],
          image_url: "https://images.example.com/brickell-alt.jpg",
        },
      ],
    },
    {
      location_public_id: "loc_public_2",
      name: "Harbor Rooms",
      address: "615 Channelside Dr",
      city: "Tampa",
      state: "FL",
      postal_code: "33602",
      neighborhood: "Channelside",
      timezone: "America/New_York",
      lat: 27.9506,
      lng: -82.4572,
      featured_image_url: "https://images.example.com/harbor.jpg",
      location_amenities: ["WiFi"],
      matching_space_count: 1,
      featured_space_public_id: "space_public_3",
      starting_day_pass_price: null,
      starting_monthly_price: null,
      starting_hourly_price: 60,
      starting_membership_price: null,
      spaces: [
        {
          public_id: "space_public_3",
          name: "Conference 14-B",
          space_type: "conference_room",
          capacity: 8,
          availability_status: "available",
          availability_start_time: "09:00:00",
          availability_end_time: "18:00:00",
          price_daily: 220,
          price_monthly: null,
          hourly_price: 60,
          membership_price: null,
          amenities: ["WiFi", "Whiteboard", "TV Display"],
          image_url: "https://images.example.com/harbor.jpg",
        },
      ],
    },
  ],
};

const meetingRoomResults = {
  meta: {
    total_locations: 1,
    page: 1,
    page_size: 20,
  },
  results: [coworkingResults.results[1]],
};

test("public marketplace can ask for browser location and search the default radius", async ({ page, context }) => {
  const marketplaceRequests: URL[] = [];

  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 26.132, longitude: -80.2624 });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/marketplace/locations") {
      marketplaceRequests.push(url);
      await json(route, coworkingResults);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  const response = await page.goto("/spaces");

  expect(response?.headers()["permissions-policy"]).toContain("geolocation=(self)");
  await expect(page).toHaveURL(/\/spaces\?/);
  await expect(page).toHaveURL(/lat=26.132/);
  await expect(page).toHaveURL(/lng=-80.2624/);
  await expect(page).toHaveURL(/radius_miles=50/);
  await expect(page.getByRole("button", { name: /Locate me/ })).toBeVisible();
  await expect(page.locator('input[placeholder="50"]')).toHaveValue("50");
  await expect(page.getByRole("heading", { name: "Open Desk A1" })).toBeVisible();
  await expect
    .poll(() =>
      marketplaceRequests.some(
        (url) =>
          url.searchParams.get("lat") === "26.132" &&
          url.searchParams.get("lng") === "-80.2624" &&
          url.searchParams.get("radius_miles") === "50",
      ),
    )
    .toBe(true);
});

test("public marketplace shows no payment-blocked listings", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/marketplace/locations") {
      await json(route, {
        meta: { total_locations: 0, page: 1, page_size: 20 },
        results: [],
      });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/spaces?q=Payment%20Blocked");

  await expect(page.getByText("No locations matched this search.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payment Blocked Workspace" })).toHaveCount(0);
});

test("public marketplace redirects to /spaces and supports route-driven location search", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/marketplace/locations") {
      const category = url.searchParams.get("category");
      await json(route, category === "meeting_room" ? meetingRoomResults : coworkingResults);
      return;
    }

    if (key === "GET /api/marketplace/locations/loc_public_1") {
      await json(route, {
        ...coworkingResults.results[0],
        spaces: [
          {
            public_id: "space_public_1",
            name: "Open Desk A1",
            space_type: "shared_desk",
            capacity: 1,
            availability_status: "available",
            availability_start_time: "08:00:00",
            availability_end_time: "18:00:00",
            price_daily: 69,
            price_monthly: null,
            hourly_price: null,
            membership_price: 299,
            amenities: ["Coffee", "WiFi"],
            image_url: "https://images.example.com/brickell.jpg",
          },
          {
            public_id: "space_public_2",
            name: "Open Desk B4",
            space_type: "shared_desk",
            capacity: 3,
            availability_status: "available",
            availability_start_time: "08:00:00",
            availability_end_time: "18:00:00",
            price_daily: 79,
            price_monthly: null,
            hourly_price: null,
            membership_price: 299,
            amenities: ["Coffee", "WiFi"],
            image_url: "https://images.example.com/brickell-alt.jpg",
          },
        ],
      });
      return;
    }

    if (key === "GET /api/marketplace/locations/loc_public_2") {
      await json(route, {
        ...coworkingResults.results[1],
        spaces: [
          {
            public_id: "space_public_3",
            name: "Conference 14-B",
            space_type: "conference_room",
            capacity: 8,
            availability_status: "available",
            availability_start_time: "09:00:00",
            availability_end_time: "18:00:00",
            price_daily: 220,
            price_monthly: null,
            hourly_price: 60,
            membership_price: null,
            amenities: ["WiFi", "Whiteboard", "TV Display"],
            image_url: "https://images.example.com/harbor.jpg",
          },
        ],
      });
      return;
    }

    if (key === "GET /api/marketplace/spaces/space_public_1") {
      await json(route, {
        space: {
          public_id: "space_public_1",
          name: "Open Desk A1",
          space_type: "shared_desk",
          capacity: 1,
          availability_status: "available",
          availability_start_time: "08:00:00",
          availability_end_time: "18:00:00",
          price_daily: 69,
          price_monthly: null,
          hourly_price: null,
          membership_price: 299,
          amenities: ["Coffee", "WiFi"],
        },
        images: [
          {
            public_id: "img_public_1",
            image_url: "https://images.example.com/brickell.jpg",
            is_primary: true,
            sort_order: 0,
          },
        ],
        location: {
          location_public_id: "loc_public_1",
          name: "Brickell Commons",
          address: "200 Brickell Ave",
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

    if (key === "GET /api/marketplace/spaces/space_public_3/availability") {
      await json(route, {
        space_public_id: "space_public_3",
        timezone: "America/New_York",
        granularity_minutes: 60,
        availability_start_time: "09:00",
        availability_end_time: "18:00",
        hourly_price: 60,
        daily_price: 220,
        days: [
          {
            date: "2026-04-15",
            fully_blocked: false,
            busy_intervals: [],
          },
        ],
      });
      return;
    }

    if (key === "GET /api/marketplace/spaces/space_public_3") {
      await json(route, {
        space: {
          public_id: "space_public_3",
          name: "Conference 14-B",
          space_type: "conference_room",
          capacity: 8,
          availability_status: "available",
          availability_start_time: "09:00:00",
          availability_end_time: "18:00:00",
          price_daily: 220,
          price_monthly: null,
          hourly_price: 60,
          membership_price: null,
          amenities: ["WiFi", "Whiteboard", "TV Display"],
        },
        images: [
          {
            public_id: "img_public_3",
            image_url: "https://images.example.com/harbor.jpg",
            is_primary: true,
            sort_order: 0,
          },
          {
            public_id: "img_public_4",
            image_url: "https://images.example.com/harbor-2.jpg",
            is_primary: false,
            sort_order: 1,
          },
        ],
        location: {
          location_public_id: "loc_public_2",
          name: "Harbor Rooms",
          address: "615 Channelside Dr",
          city: "Tampa",
          state: "FL",
          postal_code: "33602",
          neighborhood: "Channelside",
          timezone: "America/New_York",
          lat: 27.9506,
          lng: -82.4572,
          public_phone: "(954) 906-7565",
          public_email: "hello@harborrooms.test",
          public_hours_weekdays: "Monday - Friday • 9:00 AM to 5:00 PM",
          public_hours_weekends: "Saturday - Sunday • Closed",
          public_parking_notes: ["Onsite parking in covered garage"],
          public_transit_notes: ["Brightline Fort Lauderdale Station"],
          public_included_items: ["Fast, Secure Wi-Fi"],
        },
        cancellation_policy: {
          cancel_window_hours: 24,
          refund_percent: 100,
        },
        support_contacts: [
          { name: "Denis Khakovsky", title: "Owner" },
          { name: "Brian Mina", title: "Admin" },
        ],
      });
      return;
    }

    if (key === "GET /api/spaces/space_public_1") {
      await json(route, {
        public_id: "space_public_1",
        name: "Open Desk A1",
        space_type: "shared_desk",
        capacity: 1,
        price_monthly: null,
        price_daily: 69,
        availability_status: "available",
        availability_start_time: "08:00:00",
        availability_end_time: "18:00:00",
        amenities: "Coffee, WiFi",
      });
      return;
    }

    if (key === "GET /api/spaces/space_public_1/media") {
      await json(route, [
        {
          public_id: "img_public_1",
          image_url: "https://images.example.com/brickell.jpg",
          is_primary: true,
        },
      ]);
      return;
    }

    if (key === "GET /api/membership-plans/public") {
      await json(route, []);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/");

  await expect(page).toHaveURL(/\/spaces$/);
  await expect(page.getByRole("heading", { name: "Find Your Next Coworking Spot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open Desk A1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open Desk B4" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conference 14-B" })).toBeVisible();

  await page.locator('input[placeholder="Neighborhood, city, state, or ZIP"]').fill("Miami");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/\/spaces\?q=Miami$/);
  await expect(page.getByText("Results stay in the URL")).toBeVisible();

  await page.locator('[data-selected="false"]').filter({ hasText: "Conference 14-B" }).hover();
  await expect(page.locator('[data-selected="true"]').filter({ hasText: "Conference 14-B" })).toBeVisible();

  await page.getByRole("link", { name: "Meeting Rooms" }).click();
  await expect(page).toHaveURL(/\/meeting-rooms\?q=Miami$/);
  await expect(page.getByText("Book-Ready Meeting Rooms")).toBeVisible();

  await page.locator('input[type="date"]').fill("2026-04-15");
  await page.locator('input[type="time"]').nth(0).fill("10:00");
  await page.locator('input[type="time"]').nth(1).fill("11:00");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/\/meeting-rooms\?/);
  await expect(page).toHaveURL(/date=2026-04-15/);
  await expect(page).toHaveURL(/start_time=10%3A00/);
  await expect(page).toHaveURL(/end_time=11%3A00/);

  await page.locator('[data-selected="true"]').filter({ hasText: "Conference 14-B" }).click();
  await expect(page).toHaveURL(/\/spaces\/space_public_3\?/);
  await expect(page.getByRole("heading", { name: "Conference 14-B" })).toBeVisible();
  await expect(page.getByRole("button", { name: /April 15, 2026/ })).toBeVisible();
  const timeSelects = page.locator("aside select");
  await expect(timeSelects.nth(0)).toHaveValue("10:00");
  await expect(timeSelects.nth(1)).toHaveValue("11:00");

  await page.getByRole("link", { name: "Back to search" }).click();
  await expect(page).toHaveURL(/\/meeting-rooms\?/);
  await expect(page).toHaveURL(/date=2026-04-15/);

  await page.getByRole("link", { name: "Coworking & Day Passes" }).click();
  await expect(page).toHaveURL(/\/spaces\?/);
  await expect(page).toHaveURL(/q=Miami/);
  await expect(page).toHaveURL(/date=2026-04-15/);
  await expect(page).toHaveURL(/start_time=10%3A00/);
  await expect(page).toHaveURL(/end_time=11%3A00/);

  await page.getByRole("link", { name: "View location" }).first().click();
  await expect(page).toHaveURL(/\/locations\/loc_public_1\?/);
  await expect(page).toHaveURL(/route=spaces/);
  await expect(page).toHaveURL(/q=Miami/);
  await expect(page.getByRole("heading", { name: "Brickell Commons" })).toBeVisible();
  await page.getByRole("link", { name: "View space" }).first().click();

  await expect(page).toHaveURL(/\/spaces\/space_public_1\?/);
  await expect(page.getByRole("heading", { name: "Open Desk A1" })).toBeVisible();

  await page.getByRole("link", { name: "Back to search" }).click();
  await expect(page).toHaveURL(/\/spaces\?/);
  await expect(page).toHaveURL(/q=Miami/);
  await expect(page).toHaveURL(/date=2026-04-15/);

  await page.goto("/meeting-rooms/_.html?id=loc_public_2&lat=26.132029&lng=-80.262418&radius_miles=50");
  await expect(page).toHaveURL(/\/locations\/loc_public_2\?/);
  await expect(page).toHaveURL(/route=meeting-rooms/);
  await expect(page.getByRole("heading", { name: "Harbor Rooms" })).toBeVisible();
});

test("public marketplace shows no meeting rooms when the selected slot is unavailable", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/marketplace/locations") {
      const category = url.searchParams.get("category");
      const hasRequestedSlot =
        url.searchParams.get("date") === "2026-04-15" &&
        url.searchParams.get("start_time") === "10:00" &&
        url.searchParams.get("end_time") === "11:00";
      await json(
        route,
        category === "meeting_room" && hasRequestedSlot
          ? { meta: { total_locations: 0, page: 1, page_size: 20 }, results: [] }
          : meetingRoomResults,
      );
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/meeting-rooms");
  await expect(page.getByRole("heading", { name: "Conference 14-B" })).toBeVisible();

  await page.locator('input[type="date"]').fill("2026-04-15");
  await page.locator('input[type="time"]').nth(0).fill("10:00");
  await page.locator('input[type="time"]').nth(1).fill("11:00");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByText("No locations matched this search. Try widening the price cap or removing a date or capacity filter.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conference 14-B" })).not.toBeVisible();
});

test("public marketplace search excludes leased private offices", async ({ page }) => {
  const marketplaceRequests: URL[] = [];
  const privateOfficeResults = {
    meta: { total_locations: 1, page: 1, page_size: 20 },
    results: [
      {
        location_public_id: "loc_open_private",
        name: "Brickell Commons",
        address: "200 Brickell Ave",
        city: "Miami",
        state: "FL",
        postal_code: "33131",
        neighborhood: "Brickell",
        timezone: "America/New_York",
        lat: 25.7616,
        lng: -80.1918,
        featured_image_url: null,
        location_amenities: ["WiFi"],
        matching_space_count: 1,
        featured_space_public_id: "space_open_private",
        starting_day_pass_price: null,
        starting_monthly_price: 1800,
        starting_hourly_price: null,
        starting_membership_price: null,
        spaces: [
          {
            public_id: "space_open_private",
            name: "Available Private Office",
            space_type: "private_office",
            capacity: 4,
            availability_status: "available",
            availability_start_time: null,
            availability_end_time: null,
            price_daily: null,
            price_monthly: 1800,
            hourly_price: null,
            membership_price: null,
            amenities: ["WiFi"],
            image_url: null,
          },
        ],
      },
    ],
  };

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/marketplace/locations") {
      marketplaceRequests.push(url);
      await json(
        route,
        url.searchParams.get("category") === "private_office"
          ? privateOfficeResults
          : coworkingResults,
      );
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/private-offices?q=Miami");

  await expect(page.getByRole("heading", { name: "Available Private Office" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Leased Private Office" })).not.toBeVisible();
  await expect(page.getByText("Showing 1 listing")).toBeVisible();
  await expect(page.locator('input[type="date"]')).toHaveCount(1);
  await expect(page.locator('input[placeholder="Min capacity"]')).toHaveCount(1);

  await page.locator('input[type="date"]').fill("2026-06-15");
  await page.locator('input[placeholder="Min capacity"]').fill("4");
  await page.locator('input[placeholder="Any"]').fill("2000");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/\/private-offices\?/);
  await expect(page).toHaveURL(/date=2026-06-15/);
  await expect(page).toHaveURL(/capacity=4/);
  await expect(page).toHaveURL(/max_price_monthly=2000/);
  await expect
    .poll(() =>
      marketplaceRequests.some(
        (url) =>
          url.searchParams.get("category") === "private_office" &&
          url.searchParams.get("date") === "2026-06-15" &&
          url.searchParams.get("capacity") === "4" &&
          url.searchParams.get("max_price") === "2000",
      ),
    )
    .toBe(true);
});

test("day-pass detail refreshes remaining seats after a guest request", async ({ page }) => {
  let availabilityCalls = 0;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/marketplace/spaces/space_day_pass") {
      await json(route, {
        space: {
          public_id: "space_day_pass",
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
          volume_discounts: [],
          booking_products: [],
        },
        images: [],
        location: {
          location_public_id: "loc_1",
          organization_name: "Public Org",
          booking_approval_mode: "manual",
          payment_failure_hold_minutes: null,
          name: "Brickell Commons",
          address: "100 Main St",
          city: "Miami",
          state: "FL",
          postal_code: "33101",
          neighborhood: "Downtown",
          timezone: "America/New_York",
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

    if (key === "GET /api/marketplace/spaces/space_day_pass/availability") {
      availabilityCalls += 1;
      const remaining = availabilityCalls === 1 ? 2 : 1;
      await json(route, {
        space_public_id: "space_day_pass",
        timezone: "America/New_York",
        granularity_minutes: 60,
        availability_start_time: "09:00",
        availability_end_time: "17:00",
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        hourly_price: null,
        daily_price: 49,
        days: [
          {
            date: "2026-06-01",
            fully_blocked: false,
            capacity: 4,
            booked_seats: 4 - remaining,
            remaining_seats: remaining,
            busy_intervals: [],
          },
        ],
      });
      return;
    }

    if (key === "GET /api/membership-plans/public") {
      await json(route, []);
      return;
    }

    if (key === "POST /api/booking-requests/preview") {
      await json(route, {
        currency: "USD",
        base_amount_cents: 4900,
        setup_fee_amount_cents: 0,
        discount_amount_cents: 0,
        tax_amount_cents: 0,
        total_amount_cents: 4900,
        line_items: [{ label: "Day Pass x 1", amount_cents: 4900 }],
      });
      return;
    }

    if (key === "POST /api/guest/booking-requests") {
      await json(route, {
        public_id: "guest_req_1",
        status: "requested",
        start_datetime: "2026-06-01T13:00:00.000Z",
        end_datetime: "2026-06-01T21:00:00.000Z",
        space_public_id: "space_day_pass",
        estimated_amount: 49,
        message: "Request submitted",
      });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/spaces/space_day_pass?date=2026-06-01");

  await expect(page.getByRole("heading", { name: "Open Desk A1" })).toBeVisible();
  await expect(page.getByText("2 seats available for the selected day.")).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Seats" })).toHaveAttribute("max", "2");
  await expect(page.getByRole("button", { name: "Sign in to Request to book" })).toBeEnabled();

  await page.getByRole("button", { name: "Sign in to Request to book" }).click();
  const checkoutDialog = page.getByRole("dialog");
  await expect(checkoutDialog.getByRole("heading", { name: "Checkout summary" })).toBeVisible();
  await expect(checkoutDialog.getByText("Day Pass x 1")).toBeVisible();
  await checkoutDialog.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await page.getByPlaceholder("Jane Smith").fill("Test User");
  await page.getByPlaceholder("jane@example.com").fill("customer@test.com");
  await page.getByRole("button", { name: "Submit booking request" }).click();
  await expect(page.getByText("Request submitted!")).toBeVisible();
  await page.getByRole("button", { name: "Close booking request" }).click();

  await expect(page.getByText("1 seat available for the selected day.")).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Seats" })).toHaveAttribute("max", "1");
});

test("public get started menu exposes member and owner registration", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/marketplace/locations") {
      await json(route, coworkingResults);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/spaces");
  await page.getByRole("button", { name: /Get started/ }).click();

  await expect(page.getByRole("menu", { name: "Registration options" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Member registration" })).toHaveAttribute("href", "/sign-up");
  await expect(page.getByRole("menuitem", { name: "Owner registration" })).toHaveAttribute("href", "/owners/sign-up");
});
