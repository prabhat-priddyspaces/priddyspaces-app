import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

const ownerOrg = { public_id: "org_owner_a", name: "Owner A Workspace" };

function marketplaceSpace(publicId: string, organizationName: string) {
  return {
    space: {
      public_id: publicId,
      name: publicId === "space_owner_a" ? "Owner A Boardroom" : "Owner B Boardroom",
      space_type: "conference_room",
      capacity: 8,
      availability_status: "available",
      availability_start_time: "09:00:00",
      availability_end_time: "18:00:00",
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      price_daily: 300,
      price_monthly: null,
      hourly_price: 60,
      membership_price: null,
      amenities: ["whiteboard"],
    },
    images: [],
    location: {
      location_public_id: `${publicId}_loc`,
      organization_name: organizationName,
      booking_approval_mode: "auto",
      payment_failure_hold_minutes: 30,
      name: `${organizationName} Hub`,
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
  };
}

async function openCheckout(page: import("@playwright/test").Page, spaceId: string) {
  await page.goto(`/spaces/${spaceId}`);
  await expect(page.getByRole("heading", { name: spaceId === "space_owner_a" ? "Owner A Boardroom" : "Owner B Boardroom" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reserve & Pay" })).toBeEnabled();
  await page.getByLabel(/I authorize .* to charge my card now for this booking\./).check();
  await page.getByRole("button", { name: "Reserve & Pay" }).click();
  await expect(page.getByRole("heading", { name: "Checkout summary" })).toBeVisible();
}

test("owner-created promo code applies only to that owner's member bookings", async ({ page }) => {
  let activeRole: "owner" | "member" = "owner";
  const promoCodes: unknown[] = [];
  let successfulBookingPromoCode: string | null = null;

  await mockSession(page, "owner");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse(activeRole));
      return;
    }

    if (key === "GET /api/orgs") {
      await json(route, [ownerOrg]);
      return;
    }
    if (key === "GET /api/promo-codes") {
      await json(route, promoCodes);
      return;
    }
    if (key === "POST /api/promo-codes") {
      const body = route.request().postDataJSON() as {
        code: string;
        description: string;
        discount_type: string;
        discount_value: number;
        expires_at: string;
        max_redemptions: number;
        max_redemptions_per_member: number;
        is_active: boolean;
      };
      expect(body).toMatchObject({
        code: "SUMMER20",
        description: "Summer member launch",
        discount_type: "percent",
        discount_value: 20,
        max_redemptions: 10,
        max_redemptions_per_member: 1,
        is_active: true,
      });
      expect(body.expires_at).toContain("2026-09-01");
      const created = {
        public_id: "promo_summer20",
        ...body,
        total_redemptions: 0,
        total_discount_granted_cents: 0,
        revenue_impacted_cents: 0,
        status: "active",
      };
      promoCodes.push(created);
      await json(route, created);
      return;
    }
    if (key === "GET /api/tax-config") {
      await json(route, { public_id: "tax_1", rate_percent: 0 });
      return;
    }
    if (key === "GET /api/orgs/org_owner_a/booking-settings") {
      await json(route, {
        public_id: "booking_settings_1",
        name: "Owner A Workspace",
        booking_approval_mode: "auto",
        membership_lease_approval_mode: "manual",
        payment_failure_hold_minutes: 30,
        waitlist_enabled: false,
      });
      return;
    }
    if (key === "GET /api/cancellation-policies" || key === "GET /api/subscription-plans" || key === "GET /api/orgs/org_owner_a/amenities") {
      await json(route, []);
      return;
    }
    if (key === "GET /api/marketplace/spaces/space_owner_a/availability" || key === "GET /api/marketplace/spaces/space_owner_b/availability") {
      await json(route, {
        space_public_id: url.pathname.includes("space_owner_a") ? "space_owner_a" : "space_owner_b",
        timezone: "UTC",
        granularity_minutes: 60,
        availability_start_time: "09:00",
        availability_end_time: "18:00",
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        hourly_price: 60,
        daily_price: 300,
        days: [{ date: new Date().toISOString().slice(0, 10), fully_blocked: false, busy_intervals: [] }],
      });
      return;
    }
    if (key === "GET /api/marketplace/spaces/space_owner_a") {
      await json(route, marketplaceSpace("space_owner_a", "Owner A Workspace"));
      return;
    }
    if (key === "GET /api/marketplace/spaces/space_owner_b") {
      await json(route, marketplaceSpace("space_owner_b", "Owner B Workspace"));
      return;
    }
    if (key === "GET /api/membership-plans/public") {
      await json(route, []);
      return;
    }
    if (key === "POST /api/booking-requests/preview") {
      const body = route.request().postDataJSON() as { space_public_id: string; promo_code?: string };
      if (body.promo_code === "SUMMER20" && body.space_public_id === "space_owner_b") {
        await json(route, { detail: "Promo code not valid for this booking" }, 400);
        return;
      }
      if (body.promo_code === "SUMMER20") {
        await json(route, {
          currency: "USD",
          base_amount_cents: 12000,
          setup_fee_amount_cents: 0,
          discount_amount_cents: -2400,
          promo_code: "SUMMER20",
          promo_description: "Summer member launch",
          promo_discount_amount_cents: 2400,
          subtotal_after_promo_cents: 9600,
          tax_amount_cents: 0,
          total_amount_cents: 9600,
          rate_basis: "hourly",
          units: 2,
          quantity: 1,
          line_items: [{ label: "Hourly reservation", amount_cents: 12000 }],
        });
        return;
      }
      await json(route, {
        currency: "USD",
        base_amount_cents: 12000,
        setup_fee_amount_cents: 0,
        discount_amount_cents: 0,
        tax_amount_cents: 0,
        total_amount_cents: 12000,
        rate_basis: "hourly",
        units: 2,
        quantity: 1,
        line_items: [{ label: "Hourly reservation", amount_cents: 12000 }],
      });
      return;
    }
    if (key === "GET /api/payment-methods/resolve") {
      await json(route, {
        provider: "stripe",
        owner_payment_setting_public_id: "ops_owner_a",
        organization_public_id: "org_owner_a",
        is_configured: true,
        has_payment_method: true,
        payment_method_public_id: "pm_owner_a",
        publishable_key: "pk_test",
        tokenizer_url: null,
        message: null,
      });
      return;
    }
    if (key === "POST /api/booking-requests") {
      const body = route.request().postDataJSON() as { promo_code?: string };
      successfulBookingPromoCode = body.promo_code ?? null;
      await json(route, {
        public_id: "req_promo",
        created_at: "2026-06-01T16:00:00.000Z",
        space_public_id: "space_owner_a",
        space_name: "Owner A Boardroom",
        space_type: "conference_room",
        organization_name: "Owner A Workspace",
        location_public_id: "loc_owner_a",
        location_name: "Owner A Hub",
        location_address: "100 Congress Ave",
        location_city: "Austin",
        location_state: "TX",
        location_postal_code: "78701",
        location_timezone: "UTC",
        support_contacts: [],
        booking_id: 42,
        booking_public_id: "book_promo",
        estimated_amount: 96,
        start_datetime: "2026-06-01T14:00:00.000Z",
        end_datetime: "2026-06-01T16:00:00.000Z",
        status: "approved",
        payment_status: "succeeded",
        payment_provider: "stripe",
        member_owner_payment_method_public_id: "pm_owner_a",
        promo_code: "SUMMER20",
        promo_description: "Summer member launch",
        promo_discount_amount_cents: 2400,
        approved_at: "2026-06-01T16:01:00.000Z",
        rejected_at: null,
        cancelled_at: null,
        cancellation_deadline_at: null,
        payment_hold_expires_at: null,
        payment_failed_at: null,
        booking_approval_mode: "auto",
        payment_failure_hold_minutes: 30,
        operator_notes: null,
      });
      return;
    }
    if (key === "GET /api/booking-requests") {
      await json(route, []);
      return;
    }
    if (key === "GET /api/booking-waitlist") {
      await json(route, []);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/settings");
  await expect(page.getByText("Promo codes", { exact: true })).toBeVisible();
  await page.getByPlaceholder("CODE").fill("summer20");
  await page.getByPlaceholder("Percent").fill("20");
  await page.getByPlaceholder("Description").fill("Summer member launch");
  await page.locator('input[type="date"]').fill("2026-09-01");
  await page.getByPlaceholder("Max redemptions").fill("10");
  await page.getByPlaceholder("Max per member").fill("1");
  await page.getByRole("button", { name: "Add promo" }).click();

  await expect(page.getByText("Promo code created")).toBeVisible();
  await expect(page.getByText(/SUMMER20 .* 20% .* active/)).toBeVisible();
  await expect(page.getByText("Summer member launch")).toBeVisible();
  await expect(page.getByText(/Used 0 \/ 10 .* Per member 1/)).toBeVisible();

  activeRole = "member";
  await mockSession(page, "member");

  await openCheckout(page, "space_owner_b");
  await page.getByPlaceholder("Promo code").fill("SUMMER20");
  await page.getByRole("dialog").getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Promo code not valid for this booking")).toBeVisible();

  await openCheckout(page, "space_owner_a");
  await page.getByPlaceholder("Promo code").fill("SUMMER20");
  await page.getByRole("dialog").getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Promo SUMMER20")).toBeVisible();
  await expect(page.getByText("-$24")).toBeVisible();
  await expect(page.getByText("$96")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect.poll(() => successfulBookingPromoCode).toBe("SUMMER20");
  await expect(page).toHaveURL(/\/member\/requests$/);
});
