import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("owner sees company review status on locations and can request approval", async ({ page }) => {
  let approvalRequested = false;
  let approvalAttempts = 0;

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
          review_status: "pending",
        },
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
  await expect(page.getByText("Downtown")).toBeVisible();
  await expect(page.getByText("Marketplace in review")).toBeVisible();
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
  await page.getByRole("button", { name: "Approve" }).click();

  expect(patchPayload).toMatchObject({ review_status: "approved" });
});
