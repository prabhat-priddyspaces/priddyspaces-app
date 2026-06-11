import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { AdminAnalyticsScreen } from "../src/screens/admin/AdminAnalyticsScreen";
import { AdminSettingsScreen } from "../src/screens/admin/AdminSettingsScreen";
import { apiFetch } from "../src/lib/api";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

describe("AdminAnalyticsScreen", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it("renders platform summary, leaderboard, and cities", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (String(path).startsWith("/api/analytics/admin/platform?")) {
        return Promise.resolve({
          summary: {
            gmv: 250000,
            platform_earnings: 32000,
            take_rate_pct: 12.8,
            failed_payments: 4,
            new_members: 37,
            new_owners: 3,
          },
        });
      }
      if (String(path).startsWith("/api/analytics/admin/org-leaderboard?")) {
        return Promise.resolve({
          rows: [
            {
              organization_public_id: "org_1",
              organization_name: "Priddyspaces",
              review_status: "approved",
              gmv: 90000,
              platform_earnings: 11000,
              owner_net: 79000,
              payments: 120,
            },
          ],
        });
      }
      if (String(path).startsWith("/api/analytics/admin/cities?")) {
        return Promise.resolve({ rows: [{ city: "Rochester", bookings: 84, lat: null, lng: null }] });
      }
      return Promise.resolve({});
    });

    const { getByText } = render(<AdminAnalyticsScreen />);

    await waitFor(() => expect(getByText("$250,000")).toBeTruthy());
    expect(getByText("12.8%")).toBeTruthy();
    expect(getByText("Priddyspaces")).toBeTruthy();
    expect(getByText("Rochester")).toBeTruthy();
  });
});

describe("AdminSettingsScreen", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  function mockSettings() {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      const method = options?.method || "GET";
      if (path === "/api/admin/settings" && method === "GET") {
        return Promise.resolve({
          default_owner_commission_pct: 10,
          priddy_points_enabled: true,
          priddy_signup_points: 500,
          priddy_point_value_cents: 1,
          priddy_allowed_space_types: ["shared_desk"],
          priddy_allowed_booking_modes: ["day_pass"],
          booking_calendar_daily_prices_enabled: false,
          current_admin: {
            first_name: "Admin",
            last_name: "Annie",
            email: "admin@test.com",
            has_password: true,
          },
        });
      }
      if (method === "PATCH") return Promise.resolve({ first_name: "Admin", last_name: "Annie", email: "admin@test.com", has_password: true });
      return Promise.resolve({});
    });
  }

  it("saves platform defaults with web's payload", async () => {
    mockSettings();
    const { getByLabelText, getByText } = render(<AdminSettingsScreen />);

    await waitFor(() => expect(getByLabelText("Default commission").props.value).toBe("10"));
    fireEvent.changeText(getByLabelText("Default commission"), "12");
    fireEvent.press(getByLabelText("Priddy type suite"));
    fireEvent.press(getByLabelText("Save platform defaults"));

    await waitFor(() => expect(getByText("Platform defaults saved.")).toBeTruthy());
    const patchCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/admin/settings" && options?.method === "PATCH",
    );
    expect(JSON.parse(patchCall[1].body)).toEqual({
      default_owner_commission_pct: 12,
      priddy_points_enabled: true,
      priddy_signup_points: 500,
      priddy_point_value_cents: 1,
      priddy_allowed_space_types: ["shared_desk", "suite"],
      priddy_allowed_booking_modes: ["day_pass"],
      booking_calendar_daily_prices_enabled: false,
    });
  });

  it("blocks mismatched passwords and updates with web's payload", async () => {
    mockSettings();
    const { getByLabelText, getByText } = render(<AdminSettingsScreen />);

    await waitFor(() => expect(getByLabelText("Current password")).toBeTruthy());
    fireEvent.changeText(getByLabelText("New password"), "Password123!");
    fireEvent.changeText(getByLabelText("Confirm password"), "different");
    fireEvent.press(getByLabelText("Update password"));
    await waitFor(() => expect(getByText("New passwords do not match.")).toBeTruthy());

    fireEvent.changeText(getByLabelText("Current password"), "OldPassword1!");
    fireEvent.changeText(getByLabelText("Confirm password"), "Password123!");
    fireEvent.press(getByLabelText("Update password"));
    await waitFor(() => expect(getByText("Password updated.")).toBeTruthy());
    const patchCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/admin/settings/password" && options?.method === "PATCH",
    );
    expect(JSON.parse(patchCall[1].body)).toEqual({
      current_password: "OldPassword1!",
      new_password: "Password123!",
    });
  });
});
