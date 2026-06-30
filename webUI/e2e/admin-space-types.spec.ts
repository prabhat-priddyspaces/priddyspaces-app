import { expect, type Page, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

interface AdminType {
  public_id: string;
  key: string;
  label: string;
  description: string | null;
  icon: string | null;
  archetype: string;
  marketplace_category: string | null;
  capacity_applicable: boolean;
  has_physical_inventory: boolean;
  sort_order: number;
  is_enabled: boolean;
  is_system: boolean;
  valid_booking_modes: string[];
  default_booking_mode: string | null;
}

function seedTypes(): AdminType[] {
  return [
    {
      public_id: "st_conf",
      key: "conference_room",
      label: "Conference Room",
      description: null,
      icon: null,
      archetype: "room_hourly",
      marketplace_category: "meeting_room",
      capacity_applicable: true,
      has_physical_inventory: true,
      sort_order: 30,
      is_enabled: true,
      is_system: true,
      valid_booking_modes: ["hourly", "day_pass"],
      default_booking_mode: "hourly",
    },
    {
      public_id: "st_event",
      key: "event_space",
      label: "Event Space",
      description: null,
      icon: null,
      archetype: "room_hourly",
      marketplace_category: "meeting_room",
      capacity_applicable: true,
      has_physical_inventory: true,
      sort_order: 60,
      is_enabled: true,
      is_system: true,
      valid_booking_modes: ["hourly", "day_pass"],
      default_booking_mode: "hourly",
    },
  ];
}

async function routeApi(page: Page, types: AdminType[]) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const key = `${method} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("admin"));
      return;
    }
    if (key === "GET /api/admin/space-types") {
      await json(route, types);
      return;
    }
    if (method === "POST" && url.pathname === "/api/admin/space-types") {
      const body = route.request().postDataJSON() as Partial<AdminType>;
      types.push({
        public_id: `st_${body.key}`,
        key: body.key as string,
        label: body.label as string,
        description: body.description ?? null,
        icon: null,
        archetype: body.archetype as string,
        marketplace_category: body.marketplace_category ?? null,
        capacity_applicable: body.capacity_applicable ?? true,
        has_physical_inventory: body.has_physical_inventory ?? true,
        sort_order: body.sort_order ?? 100,
        is_enabled: true,
        is_system: false,
        valid_booking_modes: ["hourly", "day_pass"],
        default_booking_mode: "hourly",
      });
      await json(route, types[types.length - 1], 201);
      return;
    }
    if (method === "PATCH" && url.pathname.startsWith("/api/admin/space-types/")) {
      const pid = url.pathname.split("/").pop();
      const body = route.request().postDataJSON() as Partial<AdminType>;
      const row = types.find((t) => t.public_id === pid);
      if (row) Object.assign(row, body);
      await json(route, row ?? {});
      return;
    }
    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });
}

test("admin can disable a space type and create a new one", async ({ page }) => {
  const types = seedTypes();
  await mockSession(page, "admin");
  await routeApi(page, types);

  await page.goto("/admin/space-types");

  await expect(page.getByTestId("space-type-row-conference_room")).toBeVisible();
  await expect(page.getByTestId("space-type-row-event_space")).toBeVisible();

  // Disable Event Space.
  await page.getByTestId("space-type-enabled-event_space").click();
  await expect.poll(() => types.find((t) => t.key === "event_space")?.is_enabled).toBe(false);

  // Create a new custom type.
  await page.getByTestId("new-space-type-button").click();
  await page.getByTestId("new-space-type-key").fill("day_office");
  await page.getByTestId("new-space-type-label").fill("Day Office");
  await page.getByTestId("create-space-type-submit").click();

  await expect(page.getByTestId("space-type-row-day_office")).toBeVisible();
  expect(types.some((t) => t.key === "day_office")).toBe(true);
});
