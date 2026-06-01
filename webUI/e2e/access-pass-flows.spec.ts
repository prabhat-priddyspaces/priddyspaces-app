import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

const accessPass = {
  public_id: "pass_1",
  booking_public_id: "book_1",
  booking_request_public_id: "req_1",
  qr_payload: "https://app.test/guest/access-pass#secure-token",
  status: "active",
  pass_status: "not_yet_valid",
  valid_from_at: "2026-07-01T10:00:00Z",
  expires_at: "2026-07-01T12:00:00Z",
  checked_in_at: null,
  checked_out_at: null,
  member_name: "Member One",
  member_email: "member@example.com",
  location_public_id: "loc_1",
  location_name: "Main",
  space_public_id: "space_1",
  space_name: "Conference Room 2",
  space_type: "conference_room",
  start_datetime: "2026-07-01T10:00:00Z",
  end_datetime: "2026-07-01T12:00:00Z",
};

const resolvedPass = {
  public_id: "pass_1",
  booking_public_id: "book_1",
  booking_request_public_id: "req_1",
  member_name: "Member One",
  member_email: "member@example.com",
  location_public_id: "loc_1",
  location_name: "Main",
  space_public_id: "space_1",
  space_name: "Conference Room 2",
  space_type: "conference_room",
  start_datetime: "2026-07-01T10:00:00Z",
  end_datetime: "2026-07-01T12:00:00Z",
  checked_in_at: null,
  checked_out_at: null,
  pass_status: "valid",
  can_check_in: true,
  can_check_out: false,
  message: null,
};

const checkedInPass = {
  ...resolvedPass,
  pass_status: "already_checked_in",
  can_check_in: false,
  can_check_out: true,
  checked_in_at: "2026-07-01T10:05:00Z",
};

const attendanceRow = {
  public_id: "attendance_1",
  booking_public_id: "book_1",
  access_pass_public_id: "pass_1",
  member_public_id: "member_1",
  member_name: "Member One",
  member_email: "member@example.com",
  scanned_by_public_id: "owner_1",
  scanned_by_name: "Owner One",
  location_public_id: "loc_1",
  location_name: "Main",
  space_public_id: "space_1",
  space_name: "Conference Room 2",
  space_type: "conference_room",
  start_datetime: "2026-07-01T10:00:00Z",
  end_datetime: "2026-07-01T12:00:00Z",
  checked_in_at: "2026-07-01T10:05:00Z",
  checked_out_at: null,
  status: "checked_in",
  event_type: "check_in",
  event_at: "2026-07-01T10:05:00Z",
};

const directoryRows = [
  {
    member_public_id: "member_2",
    name: "Online Peer",
    email: "online@example.com",
    location_public_id: "loc_1",
    location_name: "Main",
    space_public_id: "space_1",
    space_name: "Conference Room 2",
    space_type: "conference_room",
    last_seen_at: "2026-07-01T10:00:00Z",
    is_currently_in_office: true,
    checked_in_at: "2026-07-01T10:05:00Z",
  },
  {
    member_public_id: "member_3",
    name: "Offline Peer",
    email: "offline@example.com",
    location_public_id: "loc_2",
    location_name: "Annex",
    space_public_id: "space_2",
    space_name: "Private Office 1",
    space_type: "private_office",
    last_seen_at: "2026-07-01T11:00:00Z",
    is_currently_in_office: false,
    checked_in_at: null,
  },
];

test("member can view a secure QR access pass", async ({ page }) => {
  await mockSession(page, "member");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;
    if (key === "GET /api/me") return json(route, meResponse("member"));
    if (key === "GET /api/access-passes") return json(route, [accessPass]);
    return json(route, []);
  });

  await page.goto("/member/access-passes");

  await expect(page.getByText("Conference Room 2")).toBeVisible();
  await expect(page.getByText("Main")).toBeVisible();
  await expect(page.getByTestId("access-pass-qr")).toBeVisible();
});

test("owner resolves a scanned token and duplicate check-in is blocked in UI state", async ({ page }) => {
  await mockSession(page, "owner");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;
    if (key === "GET /api/me") return json(route, meResponse("owner", { company_name: "Acme Spaces" }));
    if (key === "POST /api/access-passes/resolve") return json(route, resolvedPass);
    if (key === "POST /api/access-passes/check-in") return json(route, checkedInPass);
    return json(route, []);
  });

  await page.goto("/owner/access-scanner");
  await page.getByPlaceholder("Paste QR URL or token").fill("https://app.test/guest/access-pass#secure-token");
  await page.getByRole("button", { name: "Resolve" }).click();

  await expect(page.getByText("Member One")).toBeVisible();
  await expect(page.getByText("Valid", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("Already Checked In")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check in" })).toBeDisabled();
});

test("owner attendance filters include member search", async ({ page }) => {
  await mockSession(page, "owner");
  const attendanceRequests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;
    if (key === "GET /api/me") return json(route, meResponse("owner", { company_name: "Acme Spaces" }));
    if (key === "GET /api/attendance") {
      attendanceRequests.push(url.search);
      return json(route, { results: [attendanceRow], total: 1, page: 1, page_size: 100 });
    }
    if (key === "GET /api/attendance/locations") return json(route, [{ location_public_id: "loc_1", location_name: "Main" }]);
    if (key === "GET /api/attendance/current") return json(route, [attendanceRow]);
    return json(route, []);
  });

  await page.goto("/owner/attendance");
  await expect(page.getByText("Member One").first()).toBeVisible();
  await page.getByPlaceholder("Member search").fill("member@example.com");
  await expect.poll(() => attendanceRequests.some((query) => query.includes("search=member%40example.com"))).toBe(true);
});

test("member directory filters by location and current office presence", async ({ page }) => {
  await mockSession(page, "member");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;
    if (key === "GET /api/me") return json(route, meResponse("member"));
    if (key === "GET /api/member/directory") {
      let rows = directoryRows;
      const locationPublicId = url.searchParams.get("location_public_id");
      const search = url.searchParams.get("search")?.toLowerCase() || "";
      const currentlyInOffice = url.searchParams.get("currently_in_office") === "true";
      if (locationPublicId) rows = rows.filter((row) => row.location_public_id === locationPublicId);
      if (search) rows = rows.filter((row) => row.name.toLowerCase().includes(search) || row.email.toLowerCase().includes(search));
      if (currentlyInOffice) rows = rows.filter((row) => row.is_currently_in_office);
      return json(route, rows);
    }
    return json(route, []);
  });

  await page.goto("/member/directory");

  await expect(page.getByText("Online Peer")).toBeVisible();
  await expect(page.getByText("Offline Peer")).toBeVisible();
  await expect(page.getByTestId("member-presence-dot")).toBeVisible();

  await page.getByLabel("Filter by location").selectOption("loc_2");
  await expect(page.getByText("Offline Peer")).toBeVisible();
  await expect(page.getByText("Online Peer")).toBeHidden();

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText("Online Peer")).toBeVisible();

  await page.getByLabel("In office now").check();
  await expect(page.getByText("Online Peer")).toBeVisible();
  await expect(page.getByText("Offline Peer")).toBeHidden();
});

test("guest fallback access pass link resolves without login", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;
    if (key === "POST /api/access-passes/public/resolve") return json(route, accessPass);
    return json(route, []);
  });

  await page.goto("/guest/access-pass#guest-token");

  await expect(page.getByText("Guest Access Pass")).toBeVisible();
  await expect(page.getByText("Conference Room 2")).toBeVisible();
  await expect(page.getByTestId("access-pass-qr")).toBeVisible();
});
