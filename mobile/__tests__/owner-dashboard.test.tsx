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
  apiFetch: jest.fn(),
}));

function thisMonthIso() {
  return new Date().toISOString();
}

function lastMonthIso() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString();
}

function mockHappyPath() {
  (apiFetch as jest.Mock).mockImplementation((path: string) => {
    if (path === "/api/booking-requests") {
      return Promise.resolve([
        { status: "requested" },
        { status: "approved" },
        { status: "approved" },
      ]);
    }
    if (path === "/api/payments") {
      return Promise.resolve([
        // Cents-aware current-month payment with a partial refund: 200 - 50.
        { status: "succeeded", amount_cents: 20000, refunded_amount_cents: 5000, created_at: thisMonthIso() },
        // Succeeded in a prior month: counts toward volume, not MTD.
        { status: "succeeded", amount: 100, created_at: lastMonthIso() },
        // Failed payment: excluded everywhere.
        { status: "failed", amount: 999, created_at: thisMonthIso() },
      ]);
    }
    if (path === "/api/invoices") {
      return Promise.resolve([{ amount: 120 }]);
    }
    if (path === "/api/orgs") {
      return Promise.resolve([{ public_id: "org_1" }]);
    }
    if (path === "/api/subscriptions") {
      return Promise.resolve([{ status: "active" }, { status: "trialing" }, { status: "canceled" }]);
    }
    if (path.startsWith("/api/owner/calendar")) {
      return Promise.resolve({
        events: [{ kind: "booking" }, { kind: "booking" }, { kind: "request" }],
      });
    }
    if (path === "/api/orgs/org_1/members") {
      return Promise.resolve([{}, {}]);
    }
    if (path === "/api/locations?organization_public_id=org_1") {
      return Promise.resolve([{ public_id: "loc_1", name: "Hub" }]);
    }
    if (path === "/api/locations/loc_1/spaces") {
      return Promise.resolve([
        { availability_status: "available" },
        { availability_status: "occupied" },
        { availability_status: "occupied" },
        { availability_status: "occupied" },
      ]);
    }
    return Promise.resolve([]);
  });
}

describe("OwnerDashboardScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    (apiFetch as jest.Mock).mockReset();
  });

  it("computes web-parity KPIs from the same endpoints", async () => {
    mockHappyPath();
    const { getByText, getAllByText } = render(<OwnerDashboardScreen />);

    // MTD revenue: 200 - 50 refund (succeeded, current month only).
    await waitFor(() => expect(getByText("$150")).toBeTruthy());
    // Payment volume: all succeeded payments = 200 + 100.
    expect(getByText("$300")).toBeTruthy();
    // Occupancy: 3 of 4 spaces unavailable = 75%.
    expect(getByText("75%")).toBeTruthy();
    // Approved bookings.
    expect(getByText("Approved bookings")).toBeTruthy();
    // Active memberships: active + trialing (= 2, shared with approved/today/team counts).
    expect(getByText("Active memberships")).toBeTruthy();
    expect(getAllByText("2").length).toBeGreaterThanOrEqual(3);
    // Today's bookings from owner calendar booking events.
    expect(getByText("Today's bookings")).toBeTruthy();
  });

  it("opens owner lists from stat cards", async () => {
    mockHappyPath();
    const { getByLabelText, getByText } = render(<OwnerDashboardScreen />);

    await waitFor(() => expect(getByText("$150")).toBeTruthy());

    fireEvent.press(getByLabelText("Open Booking requests"));
    expect(mockNavigate).toHaveBeenCalledWith("Bookings");

    fireEvent.press(getByLabelText("Open MTD revenue"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerPayments");

    fireEvent.press(getByLabelText("Open Occupancy"));
    expect(mockNavigate).toHaveBeenCalledWith("Locations");

    fireEvent.press(getByLabelText("Open Payment volume"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerPayments");

    fireEvent.press(getByLabelText("Open Invoice count"));
    expect(mockNavigate).toHaveBeenCalledWith("Invoices");

    fireEvent.press(getByLabelText("Open Team members"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerTeam");
  });

  it("shows an empty state with a create-location action when the owner has no org", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/orgs") return Promise.resolve([]);
      if (path.startsWith("/api/owner/calendar")) return Promise.resolve(null);
      return Promise.resolve([]);
    });

    const { getByText, getByLabelText } = render(<OwnerDashboardScreen />);

    await waitFor(() => expect(getByText("No locations yet")).toBeTruthy());
    fireEvent.press(getByLabelText("Add location"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerNewLocation");
  });

  it("surfaces a dashboard load error", async () => {
    (apiFetch as jest.Mock).mockImplementation(() => {
      throw new Error("Network unreachable");
    });

    const { getByText } = render(<OwnerDashboardScreen />);

    await waitFor(() => expect(getByText("Network unreachable")).toBeTruthy());
  });
});
