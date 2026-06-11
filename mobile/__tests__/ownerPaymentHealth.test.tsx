import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerPaymentHealthScreen } from "../src/screens/owner/OwnerPaymentHealthScreen";
import { apiFetch } from "../src/lib/api";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const card = {
  public_id: "pm_1",
  member_name: "Casey Member",
  member_email: "customer@test.com",
  provider: "stripe",
  card_status: "expiring",
  card_brand: "visa",
  card_last4: "4242",
  expiry_label: "06/2026",
  open_booking_request_count: 1,
  future_booking_count: 2,
  active_subscription_count: 1,
  upcoming_booking_value_cents: 45000,
  recent_paid_volume_cents: 120000,
  last_notice: { status: "delivered", sent_at: "2026-06-01T00:00:00Z" },
};

const healthResponse = {
  summary: {
    expired_count: 1,
    expiring_count: 2,
    missing_expiry_count: 0,
    upcoming_booking_value_cents: 45000,
    recent_paid_volume_cents: 120000,
  },
  results: [card],
};

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
    if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
    if (path.startsWith("/api/locations?")) return Promise.resolve([{ public_id: "loc_1", name: "Hub" }]);
    if (path.startsWith("/api/owner/payment-health/cards?")) return Promise.resolve(healthResponse);
    if (path === "/api/owner/payment-health/card-notices" && options?.method === "POST") {
      return Promise.resolve({ sent_count: 1, skipped_count: 0, failed_count: 0 });
    }
    return Promise.resolve([]);
  });
}

describe("OwnerPaymentHealthScreen", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it("loads at-risk cards with summary and default filters", async () => {
    mockApi();
    const { getByText } = render(<OwnerPaymentHealthScreen />);

    await waitFor(() => expect(getByText("Casey Member")).toBeTruthy());
    expect(getByText("visa •••• 4242 • 06/2026")).toBeTruthy();
    expect(getByText("expiring")).toBeTruthy();
    expect(getByText("1 open requests • 2 future bookings • 1 subscriptions")).toBeTruthy();
    expect(getByText("Upcoming $450 • Recent $1,200")).toBeTruthy();

    const queryCall = (apiFetch as jest.Mock).mock.calls.find(([path]) =>
      String(path).startsWith("/api/owner/payment-health/cards?"),
    );
    expect(queryCall[0]).toContain("status=at_risk");
    expect(queryCall[0]).toContain("window_days=30");
  });

  it("re-queries when filters change", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerPaymentHealthScreen />);

    await waitFor(() => expect(getByText("Casey Member")).toBeTruthy());
    fireEvent.press(getByLabelText("Status Expired"));
    fireEvent.press(getByLabelText("Window 90 days"));
    fireEvent.press(getByLabelText("Location Hub"));

    await waitFor(() => {
      const calls = (apiFetch as jest.Mock).mock.calls.filter(([path]) =>
        String(path).startsWith("/api/owner/payment-health/cards?"),
      );
      const last = calls[calls.length - 1][0];
      expect(last).toContain("status=expired");
      expect(last).toContain("window_days=90");
      expect(last).toContain("location_public_id=loc_1");
    });
  });

  it("sends a single forced reminder and reports the result", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerPaymentHealthScreen />);

    await waitFor(() => expect(getByLabelText("Send reminder pm_1")).toBeTruthy());
    fireEvent.press(getByLabelText("Send reminder pm_1"));

    await waitFor(() => expect(getByText("1 sent")).toBeTruthy());
    const noticeCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) =>
        path === "/api/owner/payment-health/card-notices" && options?.method === "POST",
    );
    expect(JSON.parse(noticeCall[1].body)).toEqual({
      organization_public_id: "org_1",
      payment_method_public_ids: ["pm_1"],
      force: true,
    });
  });

  it("bulk-sends to selected cards without force", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerPaymentHealthScreen />);

    await waitFor(() => expect(getByLabelText("Select pm_1")).toBeTruthy());
    fireEvent.press(getByLabelText("Select pm_1"));
    fireEvent.press(getByLabelText("Send reminders to selected"));

    await waitFor(() => expect(getByText("1 sent")).toBeTruthy());
    const noticeCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) =>
        path === "/api/owner/payment-health/card-notices" && options?.method === "POST",
    );
    expect(JSON.parse(noticeCall[1].body)).toEqual({
      organization_public_id: "org_1",
      payment_method_public_ids: ["pm_1"],
      force: false,
    });
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
      if (path.startsWith("/api/locations?")) return Promise.resolve([]);
      return Promise.reject(new Error("Failed to load payment health"));
    });

    const { getByText } = render(<OwnerPaymentHealthScreen />);

    await waitFor(() => expect(getByText("Failed to load payment health")).toBeTruthy());
  });
});
