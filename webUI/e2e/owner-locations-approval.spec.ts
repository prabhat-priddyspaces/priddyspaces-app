import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("owner sees company review status on locations and can request approval", async ({ page }) => {
  let approvalRequested = false;
  let approvalAttempts = 0;
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  await mockSession(page, "owner");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }

    if (key === "GET /api/locations") {
      await json(route, [
        {
          public_id: "loc_1",
          organization_public_id: "org_1",
          name: "Downtown",
          address: "West Palmetto Park Road",
          city: "Boca Raton",
          timezone: "America/New_York",
          status: "active",
          amenities: [],
        },
      ]);
      return;
    }

    if (key === "GET /api/orgs") {
      await json(route, [
        {
          public_id: "org_1",
          name: "Boca Raton Workspace",
          display_name: "Boca Workspace",
          industry: "Coworking",
          website: "https://boca.example",
          business_email: "owner@test.com",
          business_phone: "+1 555 0100",
          description: "Workspace review detail.",
          review_status: "pending",
        },
      ]);
      return;
    }

    if (key === "GET /api/owner/marketplace-readiness") {
      await json(route, [
        {
          organization_public_id: "org_1",
          organization_name: "Boca Raton Workspace",
          provider: "stripe",
          status: "blocked",
          blockers: ["Stripe payment provider is not configured"],
          public_listing_count: 1,
          marketplace_visible_listing_count: 0,
          payment_hidden_listing_count: 1,
        },
      ]);
      return;
    }

    if (key === "GET /api/booking-requests") {
      expect(url.searchParams.get("status")).toBe("approved");
      await json(route, [
        { public_id: "req_1", location_public_id: "loc_1", end_datetime: future },
        { public_id: "req_2", location_public_id: "loc_1", end_datetime: future },
        { public_id: "req_3", location_public_id: "loc_1", end_datetime: past },
      ]);
      return;
    }

    if (key === "GET /api/locations/loc_1/spaces") {
      await json(route, [{ public_id: "space_1", availability_status: "available" }]);
      return;
    }

    if (key === "POST /api/orgs/org_1/approval-request") {
      approvalAttempts += 1;
      if (approvalAttempts === 1) {
        await json(route, { detail: "Token expired" }, 401);
        return;
      }
      approvalRequested = true;
      await json(route, {
        public_id: "org_1",
        review_status: "pending",
        recipients_notified: 1,
      });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/locations");

  await expect(page.getByRole("heading", { name: "Locations" })).toBeVisible();
  await expect(page.getByText("Payment setup required.")).toBeVisible();
  await expect(page.getByText("Your listings are hidden from search until payments are configured.")).toBeVisible();
  await expect(page.getByText("Downtown")).toBeVisible();
  await expect(page.locator("span").filter({ hasText: /^Active$/ })).toBeVisible();
  await expect(page.getByText("Upcoming approved")).toBeVisible();
  await expect(page.getByText("2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Map view" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "More" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Manage rooms" })).toHaveAttribute(
    "href",
    "/owner/locations/spaces?locationId=loc_1",
  );
  await expect(page.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/owner/locations/loc_1/edit");
  await expect(page.getByRole("link", { name: "Add space" })).toHaveAttribute(
    "href",
    "/owner/spaces/new?locationId=loc_1",
  );
  await expect(page.getByText("Marketplace in review")).toBeVisible();
  await expect(page.getByText("Hidden from search until payment setup is complete.")).toBeVisible();
  await page.getByRole("button", { name: "Request approval" }).click();

  await expect(page.getByText("Approval request sent to Admins.")).toBeVisible();
  expect(approvalRequested).toBe(true);
  expect(approvalAttempts).toBe(2);
});

test("super admin approval email link opens the company and approves it", async ({ page }) => {
  let patchPayload: Record<string, unknown> | null = null;

  await mockSession(page, "admin");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("admin"));
      return;
    }

    if (key === "GET /api/admin/owner-companies") {
      expect(url.searchParams.get("q")).toBe("org_1");
      await json(route, [
        {
          public_id: "org_1",
          name: "Boca Raton Workspace",
          review_status: "pending",
          review_notes: null,
          commission_override_pct: null,
          stripe_connected: false,
          payment_status: "blocked",
          payment_provider: "stripe",
          payment_blockers: ["Stripe payment provider is not configured"],
          marketplace_visible_listings: 0,
          payment_hidden_listings: 1,
          locations: 1,
          listings: 1,
          owner: { email: "owner@test.com", name: "Owner Test" },
          review_history: [],
        },
      ]);
      return;
    }

    if (key === "PATCH /api/admin/owner-companies/org_1") {
      patchPayload = route.request().postDataJSON() as Record<string, unknown>;
      await json(route, { public_id: "org_1", review_status: "approved", review_notes: null });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/admin/owner-companies?company=org_1&action=approve");

  await expect(page.getByText("Approval link opened. Review the company, then click Approve.")).toBeVisible();
  await expect(page.getByText("This company was opened from an approval request email.")).toBeVisible();
  await expect(page.getByText("Payment missing")).toBeVisible();
  await expect(page.getByText("Stripe payment provider is not configured")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();

  expect(patchPayload).toMatchObject({ review_status: "approved" });
});
