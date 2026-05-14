import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("member can see payment and invoice status for an approved booking request", async ({ page }) => {
  await mockSession(page, "member");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("member"));
      return;
    }

    if (key === "GET /api/booking-requests/req_paid_1") {
      await json(route, {
        public_id: "req_paid_1",
        created_at: "2026-04-13T18:30:00.000Z",
        space_public_id: "space_3",
        space_name: "Training Room East",
        space_type: "conference_room",
        location_public_id: "loc_3",
        location_name: "North Loop",
        location_address: "300 North Loop",
        location_city: "Austin",
        location_state: "TX",
        location_postal_code: "78751",
        location_timezone: "America/Chicago",
        location_public_phone: "(512) 555-0199",
        location_public_email: "support@northloop.test",
        support_contacts: [{ name: "Jordan Lee", title: "Admin" }],
        booking_id: 101,
        booking_public_id: "book_paid_1",
        start_datetime: "2026-04-15T15:00:00.000Z",
        end_datetime: "2026-04-15T18:00:00.000Z",
        status: "approved",
        payment_status: "succeeded",
        payment_provider: "stripe",
        approved_at: "2026-04-14T20:00:00.000Z",
        rejected_at: null,
        cancelled_at: null,
        cancellation_deadline_at: "2026-04-14T15:00:00.000Z",
        operator_notes: "Reception will have guest badges ready.",
        estimated_amount: 240,
      });
      return;
    }

    if (key === "GET /api/payments") {
      await json(route, [
        {
          id: 501,
          public_id: "pay_approved_1",
          amount: 240,
          status: "succeeded",
          booking_id: 101,
          subscription_id: null,
          created_at: "2026-04-15T18:15:00.000Z",
        },
      ]);
      return;
    }

    if (key === "GET /api/invoices") {
      await json(route, [
        {
          public_id: "inv_approved_1",
          amount: 240,
          status: "paid",
          booking_id: 101,
          payment_id: 501,
          pdf_url: "https://files.example.com/inv_approved_1.pdf",
          created_at: null,
        },
      ]);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/member/requests/req_paid_1");

  await expect(page.getByText("Request details")).toBeVisible();
  await expect(page.getByText("Name: Training Room East")).toBeVisible();
  await expect(page.getByText("Location: North Loop")).toBeVisible();
  await expect(page.getByText("Jordan Lee · Admin")).toBeVisible();
  await expect(page.getByText("Email: support@northloop.test")).toBeVisible();
  await expect(page.getByText(/Request sent:/)).toBeVisible();
  await expect(page.getByText(/Approved at/)).toBeVisible();
  await expect(page.getByText("Operator notes: Reception will have guest badges ready.")).toBeVisible();
  await expect(page.getByText("Payment: pay_approved_1")).toBeVisible();
  await expect(page.getByText("Status: succeeded")).toBeVisible();
  await expect(page.getByText("Invoice: inv_approved_1")).toBeVisible();
  await expect(page.getByText("Created: Not available")).toBeVisible();
  await expect(page.getByText("12/31/1969")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "View all invoices" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
});
