import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerPaymentsScreen } from "../src/screens/owner/OwnerPaymentsScreen";
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

const payments = [
  {
    id: 1,
    public_id: "pay_1",
    status: "succeeded",
    provider: "stripe",
    amount_cents: 20000,
    booking_id: 11,
    space_name: "Board Room",
    space_type: "conference_room",
    location_name: "Rochester Hub",
    location_city: "Rochester",
    member_name: "Casey Member",
    member_email: "customer@test.com",
    booking_start_datetime: "2026-06-11T14:00:00Z",
    booking_end_datetime: "2026-06-11T16:00:00Z",
    platform_fee_amount: 20,
    owner_net_amount: 180,
    commission_rate_pct: 10,
  },
  {
    id: 2,
    public_id: "pay_2",
    status: "failed",
    provider: "stripe",
    amount: 50,
    booking_id: 12,
    failure_reason: "Card declined",
  },
  {
    id: 3,
    public_id: "pay_3",
    status: "failed",
    provider: "stripe",
    amount: 99,
    subscription_id: 31,
    subscription_start_date: "2026-06-01",
  },
];

const payoutSummary = {
  gross_cents: 25000,
  tax_cents: 1000,
  refunded_cents: 2000,
  platform_fee_cents: 2500,
  owner_net_cents: 19500,
  succeeded_count: 4,
  failed_count: 2,
};

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string) => {
    if (path === "/api/payments") return Promise.resolve(payments);
    if (path === "/api/invoices") return Promise.resolve([{ public_id: "inv_1", payment_id: 1 }]);
    if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
    if (path === "/api/owner/payout-summary?organization_public_id=org_1") {
      return Promise.resolve(payoutSummary);
    }
    return Promise.resolve([]);
  });
}

describe("OwnerPaymentsScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    (apiFetch as jest.Mock).mockReset();
  });

  it("shows status stats, payout summary, and the payment ledger", async () => {
    mockApi();
    const { getByText, getAllByText } = render(<OwnerPaymentsScreen />);

    await waitFor(() => expect(getByText("Booking payment • Board Room")).toBeTruthy());
    // Stats: 1 succeeded, 2 failed; $200 appears as volume stat and ledger amount.
    expect(getByText("Processed volume")).toBeTruthy();
    expect(getAllByText("$200").length).toBe(2);
    // Payout summary from /api/owner/payout-summary.
    expect(getByText("$250")).toBeTruthy();
    expect(getByText("$195")).toBeTruthy();
    expect(getByText("Successful ledger entries: 4 • Failed entries: 2")).toBeTruthy();
    // Ledger details.
    expect(getByText("Casey Member")).toBeTruthy();
    expect(getByText("Fee $20 • Net $180 • 10%")).toBeTruthy();
    expect(getByText("Card declined")).toBeTruthy();
  });

  it("links invoices and failed payments to follow-up surfaces", async () => {
    mockApi();
    const { getByLabelText } = render(<OwnerPaymentsScreen />);

    await waitFor(() => expect(getByLabelText("Open invoice inv_1")).toBeTruthy());
    fireEvent.press(getByLabelText("Open invoice inv_1"));
    expect(mockNavigate).toHaveBeenCalledWith("Invoices");

    fireEvent.press(getByLabelText("Review follow-up pay_2"));
    expect(mockNavigate).toHaveBeenCalledWith("App", { screen: "Bookings" });

    fireEvent.press(getByLabelText("Review billing setup pay_3"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerSettings");
  });

  it("shows the empty state and surfaces payout errors", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/payments") return Promise.resolve([]);
      if (path === "/api/invoices") return Promise.resolve([]);
      if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
      if (path.startsWith("/api/owner/payout-summary")) {
        return Promise.reject(new Error("Failed to load payout summary"));
      }
      return Promise.resolve([]);
    });

    const { getByText } = render(<OwnerPaymentsScreen />);

    await waitFor(() =>
      expect(getByText("No booking or membership payments recorded yet.")).toBeTruthy(),
    );
    expect(getByText("Failed to load payout summary")).toBeTruthy();
  });
});
