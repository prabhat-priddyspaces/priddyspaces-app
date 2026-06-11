import React from "react";
import { render, waitFor } from "@testing-library/react-native";

import { AdminDashboardScreen } from "../src/screens/admin/AdminDashboardScreen";
import { apiFetch } from "../src/lib/api";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

describe("AdminDashboardScreen", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it("renders platform metrics and activity from /api/admin/dashboard", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({
      metrics: {
        users: 1200,
        members: 800,
        owner_companies: 25,
        live_listings: 140,
        bookings: 5400,
        booking_requests: 12,
        gmv: 250000,
        platform_earnings: 32000,
      },
      recent_activity: [
        {
          public_id: "act_1",
          action: "booking.approved",
          entity_type: "booking",
          entity_public_id: "bk_1",
          entity_label: "Board Room",
          actor_name: "Olive Owner",
          actor_email: null,
          created_at: "2026-06-11T10:00:00Z",
        },
      ],
    });

    const { getByText } = render(<AdminDashboardScreen />);

    await waitFor(() => expect(getByText("1,200")).toBeTruthy());
    expect(getByText("$250,000")).toBeTruthy();
    expect(getByText("$32,000")).toBeTruthy();
    expect(getByText("booking approved")).toBeTruthy();
    expect(getByText("booking • Board Room")).toBeTruthy();
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error("Failed to load dashboard"));

    const { getByText } = render(<AdminDashboardScreen />);

    await waitFor(() => expect(getByText("Failed to load dashboard")).toBeTruthy());
  });
});
