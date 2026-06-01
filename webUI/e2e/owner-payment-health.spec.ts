import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

const healthRow = {
  public_id: "pm_health_1",
  organization_public_id: "org_1",
  organization_name: "Downtown Cowork",
  member_public_id: "member_1",
  member_name: "Riley Ortiz",
  member_email: "riley@example.com",
  provider: "stripe",
  payment_method_status: "active",
  card_status: "expiring",
  card_brand: "visa",
  card_last4: "4242",
  exp_month: 6,
  exp_year: 2026,
  expiry_label: "06/2026",
  is_default_for_owner: true,
  affected_spaces: [
    {
      space_public_id: "space_1",
      space_name: "Suite 201",
      space_type: "private_office",
      location_public_id: "loc_1",
      location_name: "Downtown Hub",
      location_city: "Miami",
      sources: ["open_request", "future_booking"],
      open_request_count: 1,
      future_booking_count: 1,
      active_subscription_count: 0,
    },
  ],
  open_booking_request_count: 1,
  future_booking_count: 1,
  active_subscription_count: 0,
  upcoming_booking_value_cents: 17000,
  recent_paid_volume_cents: 20000,
  last_notice: null,
  created_at: "2026-05-01T12:00:00.000Z",
  updated_at: "2026-06-01T12:00:00.000Z",
};

function paymentHealthResponse(noticeSent: boolean) {
  return {
    generated_at: "2026-06-01T12:00:00.000Z",
    summary: {
      total_cards: 1,
      expired_count: 0,
      expiring_count: 1,
      missing_expiry_count: 0,
      healthy_count: 0,
      affected_member_count: 1,
      notices_sent_count: noticeSent ? 1 : 0,
      upcoming_booking_value_cents: 17000,
      recent_paid_volume_cents: 20000,
    },
    results: [
      {
        ...healthRow,
        last_notice: noticeSent
          ? {
              public_id: "out_1",
              status: "sent",
              subject: "Update your payment card",
              error: null,
              sent_at: "2026-06-01T12:00:00.000Z",
              last_event_at: null,
              created_at: "2026-06-01T12:00:00.000Z",
            }
          : null,
      },
    ],
  };
}

test("owner opens payment health from finance nav and sends an expiring-card email", async ({ page }) => {
  await mockSession(page, "owner");
  let noticeSent = false;
  let postedPaymentMethodIds: string[] = [];

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }
    if (key === "GET /api/owner/marketplace-readiness") {
      await json(route, []);
      return;
    }
    if (key === "GET /api/orgs") {
      await json(route, [{ public_id: "org_1", name: "Downtown Cowork" }]);
      return;
    }
    if (key === "GET /api/locations") {
      await json(route, [{ public_id: "loc_1", name: "Downtown Hub", city: "Miami" }]);
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
    if (key === "GET /api/owner/payout-summary") {
      await json(route, {
        gross_cents: 0,
        tax_cents: 0,
        refunded_cents: 0,
        platform_fee_cents: 0,
        owner_net_cents: 0,
        succeeded_count: 0,
        failed_count: 0,
      });
      return;
    }
    if (key === "GET /api/owner/payment-health/cards") {
      await json(route, paymentHealthResponse(noticeSent));
      return;
    }
    if (key === "POST /api/owner/payment-health/card-notices") {
      const payload = JSON.parse(route.request().postData() || "{}") as {
        payment_method_public_ids?: string[];
      };
      postedPaymentMethodIds = payload.payment_method_public_ids || [];
      noticeSent = true;
      await json(route, {
        sent_count: 1,
        skipped_count: 0,
        failed_count: 0,
        results: [
          {
            payment_method_public_id: "pm_health_1",
            member_email: "riley@example.com",
            status: "sent",
            reason: null,
            outbound_message_public_id: "out_1",
            outbound_status: "sent",
          },
        ],
      });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/payments");
  await page.getByRole("link", { name: "Payment health" }).click();

  await expect(page.getByRole("heading", { name: "Payment health" })).toBeVisible();
  await expect(page.getByText("Riley Ortiz")).toBeVisible();
  await expect(page.getByText("Suite 201")).toBeVisible();
  await expect(page.getByText("Visa ending 4242")).toBeVisible();

  await page.getByRole("button", { name: "Send email" }).click();

  await expect.poll(() => postedPaymentMethodIds).toEqual(["pm_health_1"]);
  await expect(page.getByText("1 sent")).toBeVisible();
  await expect(page.getByText(/Sent -/)).toBeVisible();
});
