import { expect, type Page, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

function ownerMe(overrides: Parameters<typeof meResponse>[1] = {}) {
  return meResponse("owner", {
    email: "owner.nyc@mailinator.com",
    first_name: "Owner",
    last_name: "NYC",
    phone: "555-0100",
    company_name: "Skyline Works NYC",
    ...overrides,
  });
}

async function routeOwnerAccountApi(page: Page) {
  let me = ownerMe();
  let patchPayload: Record<string, unknown> | null = null;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, me);
      return;
    }
    if (key === "PATCH /api/me") {
      patchPayload = route.request().postDataJSON() as Record<string, unknown>;
      me = { ...me, ...patchPayload };
      await json(route, me);
      return;
    }
    if (key === "GET /api/invoices") {
      await json(route, []);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  return {
    getPatchPayload: () => patchPayload,
  };
}

async function routeOwnerSettingsApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, ownerMe());
      return;
    }
    if (key === "GET /api/orgs") {
      await json(route, [
        {
          public_id: "org_1",
          name: "Skyline Works NYC",
          branding: "Premium coworking in Manhattan",
          review_status: "approved",
          review_notes: null,
        },
      ]);
      return;
    }
    if (
      key === "GET /api/promo-codes" ||
      key === "GET /api/cancellation-policies" ||
      key === "GET /api/subscription-plans" ||
      key === "GET /api/orgs/org_1/amenities"
    ) {
      await json(route, []);
      return;
    }
    if (key === "GET /api/tax-config") {
      await json(route, { detail: "Not configured" }, 404);
      return;
    }
    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });
}

test("owner can update account profile and access email/password management", async ({ page }) => {
  await mockSession(page, "owner");
  const api = await routeOwnerAccountApi(page);

  await page.goto("/owner/account");

  await expect(page.getByRole("heading", { name: "Account" }).first()).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("owner.nyc@mailinator.com");
  await page.getByLabel("First name").fill("Riley");
  await page.getByLabel("Phone").fill("555-0199");
  await page.getByRole("button", { name: "Save owner profile" }).click();

  await expect(page.getByText("Owner profile saved.")).toBeVisible();
  expect(api.getPatchPayload()).toEqual({
    first_name: "Riley",
    last_name: "NYC",
    phone: "5550199",
    company_name: "Skyline Works NYC",
  });

  await page.getByRole("button", { name: "Manage sign-in settings" }).click();
  await expect(page.getByText("Email and password settings open in Clerk account management.")).toBeVisible();
});

test("owner bottom-left profile button opens account settings", async ({ page }) => {
  await mockSession(page, "owner");
  await routeOwnerAccountApi(page);

  await page.goto("/owner/invoices");

  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
  await page.getByTestId("sidebar-profile-button").click();
  await expect(page).toHaveURL(/\/owner\/account$/);
  await expect(page.getByRole("heading", { name: "Account" }).first()).toBeVisible();
});

test("owner settings scroll main content while sidebar stays fixed", async ({ page }) => {
  await mockSession(page, "owner");
  await routeOwnerSettingsApi(page);
  await page.setViewportSize({ width: 1280, height: 600 });

  await page.goto("/owner/settings");

  await expect(page.getByRole("heading", { name: "Organization settings" })).toBeVisible();
  await expect(page.getByText("Feature flags")).toHaveCount(0);
  await expect(page.getByText("Rewards configuration", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open loyalty settings" })).toHaveCount(0);
  await expect(page.getByText("Pricing rules", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Stripe Connect", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Status: Not connected", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Space")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Organization" })).toBeVisible();

  const sidebar = page.getByTestId("workspace-sidebar");
  const main = page.getByTestId("workspace-main");
  const before = await sidebar.boundingBox();

  await main.evaluate((element) => {
    element.scrollTop = 800;
  });

  await expect.poll(async () => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const after = await sidebar.boundingBox();

  expect(before?.y).toBe(0);
  expect(after?.y).toBe(0);
});
