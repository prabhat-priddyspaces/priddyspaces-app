import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { AdminAuditLogsScreen } from "../src/screens/admin/AdminAuditLogsScreen";
import { AdminBookingsScreen } from "../src/screens/admin/AdminBookingsScreen";
import { AdminListingsScreen } from "../src/screens/admin/AdminListingsScreen";
import { apiFetch } from "../src/lib/api";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

describe("admin list screens", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it("renders audit logs with actor and impersonation context", async () => {
    (apiFetch as jest.Mock).mockResolvedValue([
      {
        public_id: "log_1",
        action: "impersonation.start",
        entity_type: "user",
        entity_public_id: "user_1",
        entity_label: "Casey Member",
        actor_name: "Admin Annie",
        actor_email: null,
        acting_as_name: "Casey Member",
        acting_as_email: "customer@test.com",
        created_at: "2026-06-11T10:00:00Z",
      },
    ]);

    const { getByText } = render(<AdminAuditLogsScreen />);

    await waitFor(() => expect(getByText("impersonation start")).toBeTruthy());
    expect(getByText("user • Casey Member")).toBeTruthy();
  });

  it("renders platform bookings and requests sections", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({
      bookings: [
        {
          public_id: "bk_1",
          status: "confirmed",
          member_name: "Casey Member",
          member_email: null,
          space_name: "Board Room",
          space_type: "conference_room",
          location_name: "Rochester Hub",
          organization_name: "Priddyspaces",
          start_datetime: "2026-06-11T14:00:00Z",
          end_datetime: "2026-06-11T16:00:00Z",
        },
      ],
      booking_requests: [
        {
          public_id: "req_1",
          status: "requested",
          member_name: null,
          member_email: "customer@test.com",
          space_name: null,
          space_type: "shared_desk",
          location_name: "Buffalo Outpost",
          organization_name: "Priddyspaces",
          start_datetime: null,
          end_datetime: null,
          operator_notes: "VIP",
        },
      ],
    });

    const { getByText } = render(<AdminBookingsScreen />);

    await waitFor(() => expect(getByText("Casey Member • confirmed")).toBeTruthy());
    expect(getByText("Priddyspaces / Rochester Hub / Board Room")).toBeTruthy();
    expect(getByText("customer@test.com • requested")).toBeTruthy();
    expect(getByText("No booking window")).toBeTruthy();
    expect(getByText("VIP")).toBeTruthy();
  });

  it("searches listings with the q parameter", async () => {
    (apiFetch as jest.Mock).mockResolvedValue([
      {
        space_public_id: "space_1",
        space_name: "Board Room",
        space_type: "conference_room",
        visibility: "public",
        availability_status: "available",
        location_name: "Rochester Hub",
        organization_name: "Priddyspaces",
        organization_review_status: "approved",
        bookings: 12,
        booking_requests: 3,
      },
    ]);

    const { getByLabelText, getByText } = render(<AdminListingsScreen />);

    await waitFor(() => expect(getByText("Board Room")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Search listings"), "board");
    fireEvent.press(getByLabelText("Search"));

    await waitFor(() => {
      expect(
        (apiFetch as jest.Mock).mock.calls.some(([path]) => path === "/api/admin/listings?q=board"),
      ).toBe(true);
    });
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error("Failed to load audit logs"));

    const { getByText } = render(<AdminAuditLogsScreen />);

    await waitFor(() => expect(getByText("Failed to load audit logs")).toBeTruthy());
  });
});
