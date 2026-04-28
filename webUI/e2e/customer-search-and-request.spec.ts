import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("customer can search spaces and submit a booking request", async ({ page }) => {
  const bookingRequest = {
    public_id: "req_1",
    space_public_id: "space_1",
    booking_id: null,
    booking_public_id: null,
    estimated_amount: 120,
    start_datetime: "2026-04-10T14:00:00.000Z",
    end_datetime: "2026-04-10T16:00:00.000Z",
    status: "requested",
    operator_notes: null,
  };

  await mockSession(page, "customer");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("customer"));
      return;
    }

    if (key === "GET /api/marketplace/search") {
      await json(route, [
        {
          space_public_id: "space_1",
          space_type: "conference_room",
          capacity: 8,
          price_daily: 120,
          price_monthly: null,
          availability_status: "available",
          availability_start_time: "09:00:00",
          availability_end_time: "18:00:00",
          location_public_id: "loc_1",
          location_name: "Downtown Hub",
          location_address: "100 Congress Ave",
          location_city: "Austin",
          location_timezone: "America/Chicago",
          amenities: "whiteboard, coffee",
          image_url: "https://images.example.com/space-1.jpg",
          distance_km: null,
        },
      ]);
      return;
    }

    if (key === "GET /api/spaces/space_1") {
      await json(route, {
        public_id: "space_1",
        space_type: "conference_room",
        capacity: 8,
        price_monthly: null,
        price_daily: 120,
        availability_status: "available",
        availability_start_time: "09:00:00",
        availability_end_time: "18:00:00",
        amenities: "whiteboard, coffee",
      });
      return;
    }

    if (key === "GET /api/spaces/space_1/media") {
      await json(route, [
        {
          public_id: "img_1",
          image_url: "https://images.example.com/space-1.jpg",
          is_primary: true,
        },
      ]);
      return;
    }

    if (key === "GET /api/subscription-plans/public") {
      await json(route, []);
      return;
    }

    if (key === "POST /api/booking-requests") {
      const payload = route.request().postDataJSON() as {
        start_datetime: string;
        end_datetime: string;
      };
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
      await json(route, []);
      return;
    }

    if (key === "GET /api/invoices") {
      await json(route, []);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/customer");

  await page.locator("#city").fill("Austin");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByText("Downtown Hub")).toBeVisible();
  await expect(page.getByText("conference_room")).toBeVisible();

  await page.getByRole("button", { name: "View details" }).click();

  await expect(page.getByRole("heading", { name: "conference_room" })).toBeVisible();
  await page.locator('input[type="datetime-local"]').nth(0).fill("2026-04-10T09:00");
  await page.locator('input[type="datetime-local"]').nth(1).fill("2026-04-10T11:00");
  await page.getByRole("button", { name: "Request booking" }).click();

  await expect(page).toHaveURL(/\/customer\/requests$/);
  await expect(page.getByText("Status:")).toBeVisible();
  await expect(page.getByText("requested")).toBeVisible();

  await page.getByRole("button", { name: "View details" }).click();

  await expect(page).toHaveURL(/\/customer\/requests\/req_1$/);
  await expect(page.getByText("Request details")).toBeVisible();
  await expect(page.getByText("No payment has been recorded yet.")).toBeVisible();
});
