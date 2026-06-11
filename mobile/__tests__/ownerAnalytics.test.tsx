import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerAnalyticsScreen } from "../src/screens/owner/OwnerAnalyticsScreen";
import { apiFetch } from "../src/lib/api";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const overview = {
  kpis: {
    revenue: { current: 250000, previous: 200000, delta_pct: 25.0 },
    bookings: { current: 42, previous: 40, delta_pct: 5.0 },
    cancellations: { current: 3, previous: 2 },
    avg_booking_value: 6000,
    active_memberships: 12,
    occupancy_pct: 63,
    retention_pct: 71,
    no_show_rate_pct: 4,
    total_spaces: 9,
    total_locations: 2,
  },
};

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string) => {
    if (path.startsWith("/api/analytics/owner/overview?")) return Promise.resolve(overview);
    if (path.startsWith("/api/analytics/owner/occupancy?")) {
      return Promise.resolve({ rows: [{ bucket: "2026-06-10", occupancy_pct: 80 }] });
    }
    if (path.startsWith("/api/analytics/owner/revenue-per-space?")) {
      return Promise.resolve({
        rows: [
          {
            space_public_id: "space_1",
            space_name: "Board Room",
            space_type: "conference_room",
            location_name: "Rochester Hub",
            bookings: 10,
            hours_booked: 25,
            owner_net: 90000,
            avg_revenue_per_hour: 3600,
          },
        ],
      });
    }
    if (path.startsWith("/api/analytics/owner/top-members?")) {
      return Promise.resolve({
        rows: [
          {
            user_public_id: "user_1",
            email: "customer@test.com",
            name: "Casey Member",
            bookings: 7,
            spend: 42000,
            last_booking: "2026-06-09T00:00:00Z",
          },
        ],
      });
    }
    if (path.startsWith("/api/analytics/owner/peak-hours?")) {
      const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
      matrix[1][9] = 6;
      return Promise.resolve({ matrix });
    }
    return Promise.resolve({});
  });
}

describe("OwnerAnalyticsScreen", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it("renders web-parity KPIs and reduced sections", async () => {
    mockApi();
    const { getByText } = render(<OwnerAnalyticsScreen />);

    await waitFor(() => expect(getByText("$2,500")).toBeTruthy());
    expect(getByText("+25.0% vs. prior period")).toBeTruthy();
    expect(getByText("63%")).toBeTruthy();
    expect(getByText("2 locations • 9 spaces")).toBeTruthy();
    expect(getByText("10 bookings • 25h • net $900 • $36/h")).toBeTruthy();
    expect(getByText("Casey Member")).toBeTruthy();
    expect(getByText("Tue 09:00 — 6 bookings")).toBeTruthy();

    const overviewCall = (apiFetch as jest.Mock).mock.calls.find(([path]) =>
      String(path).startsWith("/api/analytics/owner/overview?"),
    );
    expect(overviewCall[0]).toContain("start_date=");
    expect(overviewCall[0]).toContain("end_date=");
  });

  it("re-queries when the range is applied", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerAnalyticsScreen />);

    await waitFor(() => expect(getByText("$2,500")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Start date"), "2026-01-01");
    fireEvent.changeText(getByLabelText("End date"), "2026-01-31");
    fireEvent.press(getByLabelText("Apply range"));

    await waitFor(() => {
      const calls = (apiFetch as jest.Mock).mock.calls.filter(([path]) =>
        String(path).startsWith("/api/analytics/owner/overview?"),
      );
      expect(calls[calls.length - 1][0]).toContain("start_date=2026-01-01&end_date=2026-01-31");
    });
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation(() => Promise.reject(new Error("Failed to load analytics")));

    const { getByText } = render(<OwnerAnalyticsScreen />);

    await waitFor(() => expect(getByText("Failed to load analytics")).toBeTruthy());
  });
});
