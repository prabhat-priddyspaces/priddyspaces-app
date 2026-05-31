import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

const invoice = {
  public_id: "inv_board_room_1",
  amount: 49,
  status: "paid",
  booking_id: 101,
  booking_public_id: "book_board_room_1",
  booking_start_datetime: "2026-05-01T14:00:00.000Z",
  booking_end_datetime: "2026-05-01T16:00:00.000Z",
  payment_id: 501,
  payment_public_id: "pay_board_room_1",
  payment_provider: "stripe",
  payment_status: "succeeded",
  subscription_public_id: null,
  subscription_start_date: null,
  subscription_end_date: null,
  space_public_id: "space_board_room",
  space_name: "Board Room",
  space_type: "conference_room",
  location_name: "Downtown Hub",
  location_city: "Miami",
  description: "Booking receipt",
  pdf_url: null,
  created_at: "2026-05-01T16:05:00.000Z",
};

const payment = {
  id: 501,
  public_id: "pay_board_room_1",
  amount: 49,
  amount_cents: 4900,
  provider: "stripe",
  status: "succeeded",
  booking_id: 101,
  booking_public_id: "book_board_room_1",
  booking_start_datetime: "2026-05-01T14:00:00.000Z",
  booking_end_datetime: "2026-05-01T16:00:00.000Z",
  subscription_id: null,
  subscription_public_id: null,
  subscription_start_date: null,
  subscription_end_date: null,
  space_public_id: "space_board_room",
  space_name: "Board Room",
  space_type: "conference_room",
  location_name: "Downtown Hub",
  location_city: "Miami",
  organization_name: "Downtown Hub",
  payment_method_brand: "visa",
  payment_method_last4: "4242",
  payment_method_exp_month: 12,
  payment_method_exp_year: 2030,
  failure_reason: null,
  created_at: "2026-05-01T16:04:00.000Z",
};

const bookingMethod = {
  public_id: "pm_booking_1",
  organization_public_id: "org_1",
  organization_name: "Downtown Hub",
  provider: "stripe",
  last4: "4242",
  brand: "visa",
  exp_month: 12,
  exp_year: 2030,
  is_default_for_owner: true,
  status: "active",
  billing_name: "Member User",
  created_at: "2026-05-01T16:00:00.000Z",
};

async function mockBillingApi(page: import("@playwright/test").Page) {
  await mockSession(page, "member");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("member"));
      return;
    }

    if (key === "GET /api/invoices") {
      await json(route, [invoice]);
      return;
    }

    if (key === "GET /api/payments") {
      await json(route, [payment]);
      return;
    }

    if (key === "GET /api/payment-methods") {
      await json(route, [bookingMethod]);
      return;
    }

    if (key === "GET /api/invoices/inv_board_room_1/pdf") {
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          "Content-Disposition": 'attachment; filename="invoice-inv_board_room_1.pdf"',
        },
        body: Buffer.from("%PDF-1.4\n% test invoice\n"),
      });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });
}

test("member invoices show booking context and download a PDF", async ({ page }) => {
  await mockBillingApi(page);

  await page.goto("/member/invoices");

  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
  await expect(page.getByText("Board Room")).toBeVisible();
  await expect(page.getByText("Downtown Hub · Miami · Conference Room")).toBeVisible();
  await expect(page.getByText("Payment pay_board_room_1 via stripe, succeeded")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download invoice PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("invoice-inv_board_room_1.pdf");
});

test("member payments show space context and download the invoice PDF", async ({ page }) => {
  await mockBillingApi(page);

  await page.goto("/member/payments");

  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Membership billing" })).toBeVisible();
  await expect(page.getByText("Visa ending in 4242").first()).toBeVisible();
  await expect(page.getByText("Booking payment · Board Room")).toBeVisible();
  await expect(page.getByText("Downtown Hub · Miami · Conference Room")).toBeVisible();
  await expect(page.getByText("Invoice inv_board_room_1")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download invoice" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("invoice-inv_board_room_1.pdf");
});
