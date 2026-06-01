import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("owner can open marketing dashboard with mocked API data", async ({ page }) => {
  await mockSession(page, "owner");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }
    if (key === "GET /api/orgs") {
      await json(route, [{ public_id: "org_1", name: "Downtown Cowork" }]);
      return;
    }
    if (key === "GET /api/marketing/templates") {
      await json(route, [{ public_id: "tpl_1", name: "Welcome" }]);
      return;
    }
    if (key === "GET /api/marketing/segments") {
      await json(route, [{ public_id: "seg_1", name: "Active members" }]);
      return;
    }
    if (key === "GET /api/marketing/campaigns") {
      await json(route, [{ public_id: "camp_1", name: "May Update" }]);
      return;
    }
    if (key === "GET /api/marketing/workflows") {
      await json(route, [{ public_id: "flow_1", name: "Welcome flow" }]);
      return;
    }
    if (key === "GET /api/marketing/suppressions") {
      await json(route, [{ public_id: "sup_1", status: "active" }]);
      return;
    }
    if (key === "GET /api/marketing/settings") {
      await json(route, {
        organization_public_id: "org_1",
        default_sender_lane: "shared",
        allowed_lanes: ["shared", "verified_sender"],
        shared_daily_cap: 500,
        verified_sender_daily_cap: 2000,
        shared_from_email: "marketing@priddyspaces.com",
        shared_from_name: "Priddyspaces",
        verified_sender_public_id: null,
        verified_senders: [],
      });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/marketing");

  await expect(page.getByRole("heading", { name: "Marketing" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Templates/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Campaigns/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sender Settings/ })).toBeVisible();
});

test("marketing templates page uses compact responsive editor layout", async ({ page }) => {
  await mockSession(page, "owner");
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }
    if (key === "GET /api/orgs") {
      await json(route, [{ public_id: "org_1", name: "Downtown Cowork" }]);
      return;
    }
    if (key === "GET /api/marketing/templates") {
      await json(route, [
        {
          public_id: "tpl_1",
          organization_public_id: "org_1",
          name: "Welcome letter with a long title",
          subject: "Welcome to {{ business.name }}, {{ member.first_name }}",
          html_body: "<p>Hi {{ member.first_name }}</p>",
          text_body: "Hi {{ member.first_name }}",
          category: "transactional",
          classification: "welcome",
          variables: ["member.first_name"],
          is_archived: false,
          created_at: null,
          updated_at: null,
        },
        {
          public_id: "tpl_2",
          organization_public_id: "org_1",
          name: "Booking request received",
          subject: "We received your reservation request",
          html_body: "<p>Request received</p>",
          text_body: "Request received",
          category: "transactional",
          classification: "booking_request_received",
          variables: ["booking.request_number"],
          is_archived: false,
          created_at: null,
          updated_at: null,
        },
      ]);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/marketing/templates");
  await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();

  const listPanel = page.getByTestId("marketing-template-list-panel");
  const editorPanel = page.getByTestId("marketing-template-editor-panel");
  const shortcodesPanel = page.getByTestId("marketing-template-shortcodes-panel");
  await expect(listPanel).toBeVisible();
  await expect(editorPanel).toBeVisible();
  await expect(shortcodesPanel).toBeVisible();

  const desktop = await page.evaluate(() => {
    const rectFor = (testId: string) => {
      const el = document.querySelector(`[data-testid="${testId}"]`);
      if (!el) throw new Error(`Missing ${testId}`);
      const rect = el.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width };
    };
    return {
      list: rectFor("marketing-template-list-panel"),
      editor: rectFor("marketing-template-editor-panel"),
      shortcodes: rectFor("marketing-template-shortcodes-panel"),
    };
  });

  expect(desktop.list.width).toBeGreaterThanOrEqual(270);
  expect(desktop.list.width).toBeLessThanOrEqual(290);
  expect(desktop.shortcodes.width).toBeGreaterThanOrEqual(290);
  expect(desktop.shortcodes.width).toBeLessThanOrEqual(310);
  expect(desktop.list.left).toBeLessThan(desktop.editor.left);
  expect(desktop.editor.left).toBeLessThan(desktop.shortcodes.left);
  expect(Math.abs(desktop.list.top - desktop.editor.top)).toBeLessThanOrEqual(2);
  expect(Math.abs(desktop.editor.top - desktop.shortcodes.top)).toBeLessThanOrEqual(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();

  const mobile = await page.evaluate(() => {
    const rectFor = (testId: string) => {
      const el = document.querySelector(`[data-testid="${testId}"]`);
      if (!el) throw new Error(`Missing ${testId}`);
      const rect = el.getBoundingClientRect();
      return { top: rect.top, width: rect.width };
    };
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      list: rectFor("marketing-template-list-panel"),
      editor: rectFor("marketing-template-editor-panel"),
      shortcodes: rectFor("marketing-template-shortcodes-panel"),
    };
  });

  expect(mobile.scrollWidth).toBeLessThanOrEqual(mobile.clientWidth + 1);
  expect(mobile.list.width).toBeLessThanOrEqual(mobile.clientWidth);
  expect(mobile.editor.width).toBeLessThanOrEqual(mobile.clientWidth);
  expect(mobile.shortcodes.width).toBeLessThanOrEqual(mobile.clientWidth);
  expect(mobile.list.top).toBeLessThan(mobile.editor.top);
  expect(mobile.editor.top).toBeLessThan(mobile.shortcodes.top);
});

test("owner can insert short codes while editing a transactional template", async ({ page }) => {
  await mockSession(page, "owner");
  let savedBody: { html_body?: string } = {};

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }
    if (key === "GET /api/orgs") {
      await json(route, [{ public_id: "org_1", name: "Downtown Cowork" }]);
      return;
    }
    if (key === "GET /api/marketing/templates") {
      await json(route, [
        {
          public_id: "tpl_confirm",
          organization_public_id: "org_1",
          name: "Reservation confirmation",
          subject: "Your reservation is confirmed",
          html_body: "<p>Hi {{ member.first_name }}</p>",
          text_body: "Hi {{ member.first_name }}",
          category: "transactional",
          classification: "reservation_confirmation",
          variables: ["member.first_name"],
          is_archived: false,
          created_at: null,
          updated_at: null,
        },
      ]);
      return;
    }
    if (key === "PUT /api/marketing/templates/tpl_confirm") {
      savedBody = JSON.parse(route.request().postData() || "{}");
      await json(route, {
        public_id: "tpl_confirm",
        organization_public_id: "org_1",
        ...savedBody,
        classification: "reservation_confirmation",
        variables: ["member.first_name", "owner.email"],
        is_archived: false,
        created_at: null,
        updated_at: null,
      });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/marketing/templates");
  await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
  await page.getByRole("button", { name: /Reservation confirmation/ }).click();
  const htmlBody = page.getByLabel("HTML body");
  await htmlBody.focus();
  await page.getByRole("button", { name: /\{\{ owner\.email \}\}/ }).click();
  await expect(htmlBody).toHaveValue(/{{ owner.email }}/);
  await page.getByRole("button", { name: "Save template" }).click();

  expect(savedBody.html_body).toContain("{{ owner.email }}");
});
