import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("member onboarding submits member profile only", async ({ page }) => {
  let profilePayload: Record<string, unknown> | null = null;

  await mockSession(page, "member");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "POST /api/onboarding/profile") {
      profilePayload = route.request().postDataJSON() as Record<string, unknown>;
      await json(route, meResponse("member", { has_organization: false }));
      return;
    }
    if (key === "GET /api/me") {
      await json(route, meResponse("member", { has_organization: false }));
      return;
    }

    await json(route, { results: [], meta: { total_locations: 0, page: 1, page_size: 20 } });
  });

  await page.goto("/onboarding/member");
  await page.getByLabel("Full name").fill("Member Test");
  // Formatted/long input is stripped to digits and capped at 10.
  await page.getByLabel("Phone (optional)").fill("+1 555 100 0000");
  await expect(page.getByLabel("Phone (optional)")).toHaveValue("1555100000");
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Continue member setup" }).click();

  await expect.poll(() => profilePayload).toMatchObject({
    role: "member",
    full_name: "Member Test",
    phone: "1555100000",
    terms_accepted: true,
    privacy_policy_accepted: true,
  });
});

test("owner onboarding submits owner profile and business details without employee size", async ({ page }) => {
  let profilePayload: Record<string, unknown> | null = null;
  let organizationPayload: Record<string, unknown> | null = null;

  await mockSession(page, "owner");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "POST /api/onboarding/profile") {
      profilePayload = route.request().postDataJSON() as Record<string, unknown>;
      await json(route, meResponse("owner", { has_organization: false }));
      return;
    }
    if (key === "POST /api/onboarding/organization") {
      organizationPayload = route.request().postDataJSON() as Record<string, unknown>;
      await json(route, meResponse("owner", { has_organization: true }));
      return;
    }
    if (key === "GET /api/me") {
      await json(route, meResponse("owner", { has_organization: true }));
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/onboarding/owner");
  await page.getByLabel("Full name").fill("Owner Test");
  // Phone and Business phone strip formatting and cap at 10 digits.
  await page.getByRole("textbox", { name: "Phone *", exact: true }).fill("+1 555 200 0000");
  await expect(page.getByRole("textbox", { name: "Phone *", exact: true })).toHaveValue("1555200000");
  await page.getByLabel(/Legal business name/).fill("Austin Workspace LLC");
  await page.getByLabel("Public display name (optional)").fill("Austin Workspace");
  await page.getByLabel("Business email (optional)").fill("hello@austin.example");
  await page.getByRole("textbox", { name: "Business phone *", exact: true }).fill("+1 555 200 0100");
  await expect(page.getByRole("textbox", { name: "Business phone *", exact: true })).toHaveValue("1555200010");
  await page.getByLabel("Website (optional)").fill("https://austin.example");
  await page.getByLabel("Business description (optional)").fill("Flexible workspaces in Austin.");
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Save" }).click();

  await expect.poll(() => profilePayload).toMatchObject({
    role: "owner",
    full_name: "Owner Test",
    phone: "1555200000",
    terms_accepted: true,
    privacy_policy_accepted: true,
  });
  await expect.poll(() => organizationPayload).toMatchObject({
    name: "Austin Workspace LLC",
    display_name: "Austin Workspace",
    business_email: "hello@austin.example",
    business_phone: "1555200010",
    website: "https://austin.example",
    description: "Flexible workspaces in Austin.",
  });
  expect(organizationPayload).not.toHaveProperty("size");
  expect(organizationPayload).not.toHaveProperty("industry");
});
