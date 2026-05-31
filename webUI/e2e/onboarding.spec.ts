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
  await page.getByLabel("Phone (optional)").fill("+1 555 100 0000");
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Continue member setup" }).click();

  await expect.poll(() => profilePayload).toMatchObject({
    role: "member",
    full_name: "Member Test",
    phone: "+1 555 100 0000",
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
  await page.getByRole("textbox", { name: "Phone *", exact: true }).fill("+1 555 200 0000");
  await page.getByLabel(/Legal business name/).fill("Austin Workspace LLC");
  await page.getByLabel("Public display name (optional)").fill("Austin Workspace");
  await page.getByLabel("Business email (optional)").fill("hello@austin.example");
  await page.getByRole("textbox", { name: "Business phone *", exact: true }).fill("+1 555 200 0100");
  await page.getByLabel("Website (optional)").fill("https://austin.example");
  await page.getByLabel("Business description (optional)").fill("Flexible workspaces in Austin.");
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Save" }).click();

  await expect.poll(() => profilePayload).toMatchObject({
    role: "owner",
    full_name: "Owner Test",
    phone: "+1 555 200 0000",
    terms_accepted: true,
    privacy_policy_accepted: true,
  });
  await expect.poll(() => organizationPayload).toMatchObject({
    name: "Austin Workspace LLC",
    display_name: "Austin Workspace",
    business_email: "hello@austin.example",
    business_phone: "+1 555 200 0100",
    website: "https://austin.example",
    description: "Flexible workspaces in Austin.",
  });
  expect(organizationPayload).not.toHaveProperty("size");
  expect(organizationPayload).not.toHaveProperty("industry");
});
