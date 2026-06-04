import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("owner creates a suite with an inline lease term in one form", async ({ page }) => {
  const createdPlans: Array<Record<string, unknown>> = [];
  let enabledBookingMode: string | null = null;

  await mockSession(page, "owner");
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
      await json(route, [{ public_id: "org_1", name: "Owner Org" }]);
      return;
    }
    if (key === "GET /api/locations") {
      await json(route, [{ public_id: "loc_1", name: "Austin Hub", city: "Austin" }]);
      return;
    }
    if (key === "POST /api/spaces") {
      await json(route, { public_id: "space_suite" });
      return;
    }
    if (key === "POST /api/membership-plans") {
      createdPlans.push(route.request().postDataJSON() as Record<string, unknown>);
      await json(route, { public_id: `plan_${createdPlans.length}` });
      return;
    }
    if (key === "PUT /api/spaces/space_suite/booking-modes") {
      const body = route.request().postDataJSON() as { booking_mode: string };
      enabledBookingMode = body.booking_mode;
      await json(route, {});
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/spaces/new?locationId=loc_1");

  await expect(page.getByRole("heading", { name: "Create a Space" })).toBeVisible();
  await page.getByLabel("Space type").selectOption("suite");

  // Lease Terms section is on the main form, and Save is gated on having a term.
  await expect(page.getByRole("heading", { name: "Lease Terms" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Space" })).toBeDisabled();

  await page.getByRole("button", { name: "Add term" }).click();
  await page.getByLabel("Term length (months)").fill("12");
  await page.getByLabel("Monthly price ($)").fill("4085");

  await expect(page.getByRole("button", { name: "Save Space" })).toBeEnabled();
  await page.getByRole("button", { name: "Save Space" }).click();

  await expect.poll(() => createdPlans.length).toBe(1);
  expect(createdPlans[0]).toMatchObject({
    space_public_id: "space_suite",
    booking_mode: "suite_lease",
    price_cents: 408500,
    commitment_months: 12,
    billing_cycle: "monthly",
  });
  await expect.poll(() => enabledBookingMode).toBe("suite_lease");
});
