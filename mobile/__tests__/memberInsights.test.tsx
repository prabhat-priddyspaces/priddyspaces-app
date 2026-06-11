import React from "react";
import { render, waitFor } from "@testing-library/react-native";

import { MemberInsightsScreen } from "../src/screens/member/MemberInsightsScreen";
import { apiFetch } from "../src/lib/api";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const summary = {
  totals: { visits: 42, hours: 96, spent: 125000, upcoming: 3, past: 39 },
  favourite_space: {
    space_public_id: "space_1",
    space_name: "Board Room",
    location_name: "Rochester Hub",
  },
  usual: { day_of_week: 1, hour: 9 },
  upcoming: [
    {
      public_id: "b_1",
      start_datetime: "2026-06-15T09:00:00",
      end_datetime: "2026-06-15T12:00:00",
    },
  ],
  visit_series: [
    { bucket: "2026-W20", visits: 2 },
    { bucket: "2026-W21", visits: 5 },
  ],
};

describe("MemberInsightsScreen", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it("renders KPI totals, favourites, usual slot, visit series, and upcoming bookings", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/analytics/me/summary") return Promise.resolve(summary);
      return Promise.resolve({});
    });

    const { getByText } = render(<MemberInsightsScreen />);

    await waitFor(() => expect(getByText("42")).toBeTruthy());
    expect(getByText("96h")).toBeTruthy();
    expect(getByText("$1,250")).toBeTruthy();
    expect(getByText("3 / 39")).toBeTruthy();
    expect(getByText("Board Room")).toBeTruthy();
    expect(getByText("Rochester Hub")).toBeTruthy();
    expect(getByText("Tuesdays · 09:00")).toBeTruthy();
    expect(getByText("2026-W21")).toBeTruthy();
    expect(getByText("Upcoming bookings (1)")).toBeTruthy();
    expect(getByText("2026-06-15 09:00 → 2026-06-15 12:00")).toBeTruthy();
  });

  it("handles empty insight slots like web", async () => {
    (apiFetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ...summary,
        favourite_space: { space_public_id: null, space_name: null, location_name: null },
        usual: { day_of_week: null, hour: null },
        upcoming: [],
        visit_series: [],
      }),
    );

    const { getByText, getAllByText } = render(<MemberInsightsScreen />);

    await waitFor(() => expect(getByText("No completed bookings yet")).toBeTruthy());
    expect(getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(getByText("No upcoming bookings.")).toBeTruthy();
    expect(getByText("No visits yet.")).toBeTruthy();
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation(() => Promise.reject(new Error("Failed to load insights")));

    const { getByText } = render(<MemberInsightsScreen />);

    await waitFor(() => expect(getByText("Failed to load insights")).toBeTruthy());
  });
});
