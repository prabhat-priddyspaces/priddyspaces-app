import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerDashboardScreen } from "../src/screens/owner/OwnerDashboardScreen";
import { apiFetch } from "../src/lib/api";

const mockNavigate = jest.fn();

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn((path: string) => {
    if (path === "/api/booking-requests") {
      return Promise.resolve([{ status: "requested" }, { status: "approved" }]);
    }
    if (path === "/api/payments") {
      return Promise.resolve([{ amount: 120 }]);
    }
    if (path === "/api/invoices") {
      return Promise.resolve([{ amount: 120 }]);
    }
    if (path === "/api/orgs") {
      return Promise.resolve([{ public_id: "org_1" }]);
    }
    if (path === "/api/orgs/org_1/members") {
      return Promise.resolve([{}, {}]);
    }
    return Promise.resolve([]);
  }),
}));

describe("OwnerDashboardScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    (apiFetch as jest.Mock).mockClear();
  });

  it("opens owner lists from stat cards", async () => {
    const { getByLabelText, getByText } = render(<OwnerDashboardScreen />);

    await waitFor(() => expect(getByText("$120")).toBeTruthy());

    fireEvent.press(getByLabelText("Open Booking requests"));
    expect(mockNavigate).toHaveBeenCalledWith("Bookings");

    fireEvent.press(getByLabelText("Open Payment volume"));
    expect(mockNavigate).toHaveBeenCalledWith("Payments");

    fireEvent.press(getByLabelText("Open Invoice count"));
    expect(mockNavigate).toHaveBeenCalledWith("Invoices");

    fireEvent.press(getByLabelText("Open Team members"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerTeam");
  });
});
