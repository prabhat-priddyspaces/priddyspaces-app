import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import AdminSettingsPage from "../app/admin/settings/page";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
  getActiveImpersonationToken: vi.fn(() => null),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/admin/settings"),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

function meResponse(platformRole = "superadmin") {
  return {
    public_id: "admin-1",
    email: "admin@example.com",
    first_name: "Admin",
    last_name: "User",
    role: null,
    app_role: null,
    platform_role: platformRole,
    default_route: "/admin",
    impersonation: {
      is_impersonating: false,
      actor_public_id: null,
      actor_email: null,
      actor_platform_role: null,
      target_public_id: null,
      target_email: null,
      reason: null,
    },
  };
}

function settingsResponse(enabled = false) {
  return {
    default_owner_commission_pct: 0,
    priddy_points_enabled: true,
    priddy_signup_points: 1000,
    priddy_point_value_cents: 1,
    priddy_allowed_space_types: ["shared_desk"],
    priddy_allowed_booking_modes: ["day_pass"],
    booking_calendar_daily_prices_enabled: enabled,
    current_admin: {
      public_id: "admin-1",
      email: "admin@example.com",
      first_name: "Admin",
      last_name: "User",
      name: "Admin User",
      created_at: "2026-06-01T12:00:00Z",
      has_password: true,
    },
  };
}

describe("AdminSettingsPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/me") return Promise.resolve(meResponse());
      if (path === "/api/admin/settings" && init?.method === "GET") {
        return Promise.resolve(settingsResponse(false));
      }
      if (path === "/api/admin/settings" && init?.method === "PATCH") {
        return Promise.resolve(settingsResponse(true));
      }
      return Promise.resolve({});
    });
  });

  it("lets superadmins enable booking calendar daily prices", async () => {
    render(<AdminSettingsPage />);

    const toggle = await screen.findByTestId("booking-calendar-daily-prices-toggle");
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Save defaults" }));

    await waitFor(() => {
      const saveCall = apiFetchMock.mock.calls.find(
        ([path, init]) => path === "/api/admin/settings" && init?.method === "PATCH"
      );
      expect(saveCall).toBeTruthy();
      expect(JSON.parse(saveCall[1].body as string)).toMatchObject({
        booking_calendar_daily_prices_enabled: true,
      });
    });
  });
});
