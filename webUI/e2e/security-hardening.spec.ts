import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("marketing template preview renders in a sandboxed iframe", async ({ page }) => {
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
      await json(route, [
        {
          public_id: "tpl_1",
          organization_public_id: "org_1",
          name: "Unsafe preview",
          subject: "Preview",
          html_body: "<p>Original</p>",
          text_body: "Original",
          category: "general",
          variables: [],
          is_archived: false,
        },
      ]);
      return;
    }
    if (key === "POST /api/marketing/templates/tpl_1/preview") {
      await json(route, {
        subject: "Preview",
        html_body: '<p>Safe copy</p><script>window.top.__marketingPreviewXss = true;</script>',
        text_body: "Safe copy",
        missing_values: [],
      });
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/marketing/templates");
  await page.getByRole("button", { name: /Unsafe preview/ }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();

  const preview = page.frameLocator('iframe[title="Template preview"]');
  await expect(preview.getByText("Safe copy")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __marketingPreviewXss?: boolean }).__marketingPreviewXss))
    .toBeUndefined();
});

test("space photo upload rejects oversized images before presigning", async ({ page }) => {
  await mockSession(page, "owner");
  let presignCalled = false;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }
    if (key === "GET /api/spaces/space_1") {
      await json(route, { public_id: "space_1", space_type: "conference_room" });
      return;
    }
    if (key === "GET /api/spaces/space_1/media") {
      await json(route, []);
      return;
    }
    if (key === "POST /api/media/presign") {
      presignCalled = true;
      await json(route, { detail: "Presign should not be called" }, 500);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/spaces/space_1/media");
  await page.getByLabel("Image file").setInputFiles({
    name: "too-large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await page.getByRole("button", { name: "Upload Photo" }).click();

  await expect(page.getByText("Image must be 10 MB or smaller.")).toBeVisible();
  expect(presignCalled).toBe(false);
});
