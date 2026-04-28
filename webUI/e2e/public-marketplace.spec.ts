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

test("public marketplace redirects to /coworking and supports route-driven location search", async ({ page }) => {
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

    if (key === "GET /api/subscription-plans/public") {
      await json(route, []);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/");

  await expect(page).toHaveURL(/\/coworking$/);
  await expect(page.getByRole("heading", { name: "Find Your Next Coworking Spot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Brickell Commons" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Harbor Rooms" })).toBeVisible();

  await page.locator('input[placeholder="Neighborhood, city, state, or ZIP"]').fill("Miami");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/\/coworking\?q=Miami$/);
  await expect(page.getByText("Results stay in the URL")).toBeVisible();

  await page.locator('[data-selected="false"]').filter({ hasText: "Harbor Rooms" }).hover();
  await expect(page.locator('[data-selected="true"]').filter({ hasText: "Harbor Rooms" })).toBeVisible();

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

  await page.locator('[data-selected="true"]').filter({ hasText: "Harbor Rooms" }).click();
  await expect(page).toHaveURL(/\/spaces\/_\?.*id=space_public_3/);
  await expect(page.getByRole("heading", { name: "Conference 14-B" })).toBeVisible();
  await expect(page.getByRole("button", { name: /April 15, 2026/ })).toBeVisible();
  const timeSelects = page.locator("aside select");
  await expect(timeSelects.nth(0)).toHaveValue("10:00");
  await expect(timeSelects.nth(1)).toHaveValue("11:00");

  await page.getByRole("link", { name: "Back to search" }).click();
  await expect(page).toHaveURL(/\/meeting-rooms\?/);
  await expect(page).toHaveURL(/date=2026-04-15/);

  await page.getByRole("link", { name: "Coworking & Day Passes" }).click();
  await expect(page).toHaveURL(/\/coworking\?/);
  await expect(page).toHaveURL(/q=Miami/);
  await expect(page).toHaveURL(/date=2026-04-15/);
  await expect(page).toHaveURL(/start_time=10%3A00/);
  await expect(page).toHaveURL(/end_time=11%3A00/);

  await page.getByRole("link", { name: "View location" }).first().click();
  await expect(page).toHaveURL(/\/coworking\/_\?.*id=loc_public_1/);
  await expect(page).toHaveURL(/q=Miami/);
  await expect(page.getByRole("heading", { name: "Brickell Commons" })).toBeVisible();
  await page.getByRole("link", { name: "View space" }).first().click();

  await expect(page).toHaveURL(/\/spaces\/_\?.*id=space_public_1/);
  await expect(page.getByRole("heading", { name: "Open Desk A1" })).toBeVisible();

  await page.getByRole("link", { name: "Back to search" }).click();
  await expect(page).toHaveURL(/\/coworking\?/);
  await expect(page).toHaveURL(/q=Miami/);
  await expect(page).toHaveURL(/date=2026-04-15/);
});
