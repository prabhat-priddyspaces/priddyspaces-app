import { expect, type Route, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

const invoice = {
  public_id: "inv_owner_board_room_1",
  amount: 120,
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
  member_name: "Riley Ortiz",
  member_email: "riley@example.com",
  description: "Booking receipt",
  pdf_url: null,
  created_at: "2026-05-01T16:05:00.000Z",
};

const payment = {
  id: 501,
  public_id: "pay_board_room_1",
  amount: 120,
  amount_cents: 12000,
  provider: "stripe",
  status: "succeeded",
  member_name: "Riley Ortiz",
  member_email: "riley@example.com",
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
  failure_reason: null,
  commission_rate_pct: 10,
  platform_fee_amount: 12,
  owner_net_amount: 108,
  created_at: "2026-05-01T16:04:00.000Z",
};

async function fulfillPdf(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: "application/pdf",
    headers: {
      "Content-Disposition": 'attachment; filename="invoice-inv_owner_board_room_1.pdf"',
    },
    body: Buffer.from("%PDF-1.4\n% test invoice\n"),
  });
}

test("owner invoices show member, space, payment context and download a PDF", async ({ page }) => {
  await mockSession(page, "owner");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }
    if (key === "GET /api/invoices") {
      await json(route, [invoice]);
      return;
    }
    if (key === "GET /api/invoices/inv_owner_board_room_1/pdf") {
      await fulfillPdf(route);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/invoices");

  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
  await expect(page.getByText("Booking receipt · Board Room")).toBeVisible();
  await expect(page.getByText("Riley Ortiz · riley@example.com")).toBeVisible();
  await expect(page.getByText("Downtown Hub · Miami · Conference Room")).toBeVisible();
  await expect(page.getByText("Payment pay_board_room_1 via stripe, succeeded")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download invoice PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("invoice-inv_owner_board_room_1.pdf");
});

test("owner payments show member, space, invoice, fee and net context", async ({ page }) => {
  await mockSession(page, "owner");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }
    if (key === "GET /api/payments") {
      await json(route, [payment]);
      return;
    }
    if (key === "GET /api/invoices") {
      await json(route, [invoice]);
      return;
    }
    if (key === "GET /api/orgs") {
      await json(route, [{ public_id: "org_1", name: "Downtown Cowork" }]);
      return;
    }
    if (key === "GET /api/owner/payout-summary") {
      await json(route, {
        gross_cents: 12000,
        tax_cents: 0,
        refunded_cents: 0,
        platform_fee_cents: 1200,
        owner_net_cents: 10800,
        succeeded_count: 1,
        failed_count: 0,
      });
      return;
    }
    if (key === "GET /api/invoices/inv_owner_board_room_1/pdf") {
      await fulfillPdf(route);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/payments");

  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
  await expect(page.getByText("Booking payment · Board Room")).toBeVisible();
  await expect(page.getByText("Riley Ortiz · riley@example.com")).toBeVisible();
  await expect(page.getByText("Downtown Hub · Miami · Conference Room")).toBeVisible();
  await expect(page.getByText("Invoice inv_owner_board_room_1")).toBeVisible();
  await expect(page.getByText(/Fee \$12/)).toBeVisible();
  await expect(page.getByText(/Net \$108/)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download invoice" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("invoice-inv_owner_board_room_1.pdf");
});

test("admin payments show member, organization, space and earnings context", async ({ page }) => {
  await mockSession(page, "admin");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("admin"));
      return;
    }
    if (key === "GET /api/admin/payments") {
      await json(route, {
        summary: {
          gmv: 120,
          platform_earnings: 12,
          owner_net: 108,
          failed_payments: 0,
        },
        results: [
          {
            public_id: "pay_admin_board_room_1",
            status: "succeeded",
            amount: 120,
            amount_cents: 12000,
            currency: "usd",
            provider: "stripe",
            provider_payment_id: "pi_test_admin",
            failure_reason: null,
            commission_rate_pct: 10,
            platform_fee_amount: 12,
            owner_net_amount: 108,
            member_name: "Riley Ortiz",
            member_email: "riley@example.com",
            organization_name: "Downtown Cowork",
            booking_public_id: "book_board_room_1",
            booking_start_datetime: "2026-05-01T14:00:00.000Z",
            booking_end_datetime: "2026-05-01T16:00:00.000Z",
            subscription_public_id: null,
            subscription_start_date: null,
            subscription_end_date: null,
            space_name: "Board Room",
            space_type: "conference_room",
            location_name: "Downtown Hub",
            location_city: "Miami",
            created_at: "2026-05-01T16:04:00.000Z",
          },
        ],
      });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/admin/payments");

  await expect(page.getByRole("heading", { name: "Payments & Earnings" })).toBeVisible();
  await expect(page.getByText("Booking payment · Board Room")).toBeVisible();
  await expect(page.getByText("Riley Ortiz · riley@example.com")).toBeVisible();
  await expect(page.getByText("Downtown Cowork · Downtown Hub · Miami · Conference Room")).toBeVisible();
  await expect(page.getByText("Booking book_board_room_1")).toBeVisible();
  await expect(page.getByText(/Fee \$12/)).toBeVisible();
  await expect(page.getByText(/Owner net \$108/)).toBeVisible();
  await expect(page.getByText("Commission 10%")).toBeVisible();
});
