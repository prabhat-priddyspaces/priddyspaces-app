import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

const stripeSetting = {
  public_id: "ops_stripe_missing_secret",
  provider: "stripe",
  is_enabled: false,
  is_test_mode: true,
  stripe_publishable_key: "pk_test_owner",
  has_stripe_secret_key: false,
  has_stripe_webhook_secret: false,
  cardpointe_merchant_id: null,
  has_cardpointe_username: false,
  has_cardpointe_password: false,
  cardpointe_site: null,
  cardpointe_tokenizer_url: null,
  connection_status: "untested",
  last_tested_at: null,
};

test("owner sees a setup error when enabling an incomplete payment provider", async ({ page }) => {
  await mockSession(page, "owner");
  let enableCalled = false;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }

    if (key === "GET /api/notifications") {
      await json(route, { results: [], total: 0, unread_count: 0, page: 1, page_size: 20 });
      return;
    }

    if (key === "GET /api/orgs") {
      await json(route, [{ public_id: "org_payments_1", name: "North Loop Cowork" }]);
      return;
    }

    if (key === "GET /api/locations") {
      await json(route, [{ public_id: "loc_payments_1", name: "North Loop" }]);
      return;
    }

    if (key === "GET /api/owner/payment-settings") {
      await json(route, [stripeSetting]);
      return;
    }

    if (key === "POST /api/owner/payment-settings/ops_stripe_missing_secret/enable") {
      enableCalled = true;
      await json(route, { detail: "Payment provider setup incomplete: Stripe secret key" }, 400);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/settings/payments");

  await expect(page.getByRole("heading", { name: "Payment settings" })).toBeVisible();
  await expect(page.getByText("Disabled • Test • untested")).toBeVisible();
  await page.getByRole("button", { name: "Enable" }).click();

  await expect.poll(() => enableCalled).toBe(true);
  await expect(page.getByText("Payment provider setup incomplete: Stripe secret key")).toBeVisible();
});
