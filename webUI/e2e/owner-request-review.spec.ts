import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

test("owner can review a request and approve it with notes", async ({ page }) => {
  const requestState = {
    public_id: "req_2",
    booking_id: null as number | null,
    booking_public_id: null as string | null,
    start_datetime: "2026-04-11T14:00:00.000Z",
    end_datetime: "2026-04-11T15:30:00.000Z",
    status: "requested",
    estimated_amount: 180,
    operator_notes: null as string | null,
  };

  await mockSession(page, "owner");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }

    if (key === "GET /api/booking-requests") {
      await json(route, [requestState]);
      return;
    }

    if (key === "POST /api/booking-requests/req_2/approved") {
      const payload = route.request().postDataJSON() as { operator_notes?: string | null };
      requestState.status = "approved";
      requestState.operator_notes = payload.operator_notes || null;
      requestState.booking_id = 44;
      requestState.booking_public_id = "book_approved_1";
      await json(route, requestState);
      return;
    }

    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  await page.goto("/owner/requests");

  await expect(page.getByRole("heading", { name: "Requests" })).toBeVisible();
  await expect(page.getByText("Estimated amount: $180")).toBeVisible();

  const notes = page.locator("textarea").first();
  await notes.fill("Approved for the afternoon block");
  await page.getByRole("button", { name: "Approve" }).click();

  await expect(page.getByText("Status: approved")).toBeVisible();
  await expect(page.getByText("Booking created: book_approved_1")).toBeVisible();
  await expect(notes).toHaveValue("Approved for the afternoon block");
});
