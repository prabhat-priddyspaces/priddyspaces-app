import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { AdminMembersScreen } from "../src/screens/admin/AdminMembersScreen";
import { AdminOwnerUsersScreen } from "../src/screens/admin/AdminOwnerUsersScreen";
import { apiFetch } from "../src/lib/api";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

describe("AdminMembersScreen", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it("applies web's filter query params", async () => {
    (apiFetch as jest.Mock).mockResolvedValue([
      {
        public_id: "user_1",
        email: "customer@test.com",
        name: "Casey Member",
        is_active: true,
        email_verified: true,
        bookings: 4,
        payments: 3,
        subscriptions: 1,
      },
    ]);

    const { getByLabelText, getByText } = render(<AdminMembersScreen />);

    await waitFor(() => expect(getByText("Casey Member")).toBeTruthy());
    expect(getByText("4 bookings • 3 payments • 1 subscriptions")).toBeTruthy();

    fireEvent.press(getByLabelText("Filter Failed payments"));
    await waitFor(() => {
      expect(
        (apiFetch as jest.Mock).mock.calls.some(([path]) =>
          String(path).includes("has_failed_payments=true"),
        ),
      ).toBe(true);
    });

    fireEvent.changeText(getByLabelText("Signup from"), "2026-01-01");
    await waitFor(() => {
      expect(
        (apiFetch as jest.Mock).mock.calls.some(([path]) => String(path).includes("signup_from=2026-01-01")),
      ).toBe(true);
    });
  });
});

describe("AdminOwnerUsersScreen", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it("lists owner users and searches with q", async () => {
    (apiFetch as jest.Mock).mockResolvedValue([
      {
        membership_public_id: "om_1",
        user_public_id: "user_2",
        email: "owner@test.com",
        name: "Olive Owner",
        organization_name: "Priddyspaces",
        organization_review_status: "approved",
        role: "owner",
        assigned_locations: 2,
      },
    ]);

    const { getByLabelText, getByText } = render(<AdminOwnerUsersScreen />);

    await waitFor(() => expect(getByText("Olive Owner")).toBeTruthy());
    expect(getByText("Priddyspaces • review approved")).toBeTruthy();

    fireEvent.changeText(getByLabelText("Search owner users"), "olive");
    fireEvent.press(getByLabelText("Search"));
    await waitFor(() => {
      expect(
        (apiFetch as jest.Mock).mock.calls.some(([path]) => path === "/api/admin/owner-users?q=olive"),
      ).toBe(true);
    });
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error("Failed to load owner users"));

    const { getByText } = render(<AdminOwnerUsersScreen />);

    await waitFor(() => expect(getByText("Failed to load owner users")).toBeTruthy());
  });
});
