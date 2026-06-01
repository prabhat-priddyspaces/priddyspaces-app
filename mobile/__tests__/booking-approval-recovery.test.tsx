import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerSettingsScreen } from "../src/screens/owner/OwnerSettingsScreen";
import { BookingDetailScreen } from "../src/screens/BookingDetailScreen";
import { SpaceDetailScreen } from "../src/screens/member/SpaceDetailScreen";
import { apiFetch } from "../src/lib/api";

const mockNavigate = jest.fn();
let mockRouteParams: any = {};

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock("@stripe/stripe-react-native", () => ({
  useStripe: () => ({
    initPaymentSheet: jest.fn(),
    presentPaymentSheet: jest.fn(),
  }),
}));

jest.mock("../src/components/BookingPaymentMethodSetup", () => ({
  BookingPaymentMethodSetup: ({ onSaved }: { onSaved: (id: string) => void }) => {
    const { Text, TouchableOpacity } = require("react-native");
    return (
      <TouchableOpacity onPress={() => onSaved("pm_new")}>
        <Text>Mock save card</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

describe("booking approval and recovery mobile flows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};
  });

  it("saves owner booking approval settings", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/orgs/org_1/booking-settings" && init?.method === "GET") {
        return Promise.resolve({
          booking_approval_mode: "manual",
          membership_lease_approval_mode: "manual",
          payment_failure_hold_minutes: 30,
        });
      }
      if (path === "/api/orgs/org_1/booking-settings" && init?.method === "PATCH") {
        return Promise.resolve({
          booking_approval_mode: "auto",
          membership_lease_approval_mode: "auto",
          payment_failure_hold_minutes: 15,
        });
      }
      if (path.startsWith("/api/promo-codes")) return Promise.resolve([]);
      if (path.startsWith("/api/tax-config")) return Promise.resolve(null);
      if (path.startsWith("/api/cancellation-policies")) return Promise.resolve([]);
      if (path.startsWith("/api/subscription-plans")) return Promise.resolve([]);
      if (path.startsWith("/api/stripe/connect/status")) return Promise.resolve({ connected: false });
      return Promise.resolve([]);
    });

    const screen = render(<OwnerSettingsScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("Organization public id"), "org_1");

    expect(await screen.findByText(/Current: hourly\/day-pass manual approval/)).toBeTruthy();
    const autoApproveButtons = screen.getAllByText("Auto approve");
    fireEvent.press(autoApproveButtons[0]);
    fireEvent.press(autoApproveButtons[1]);
    fireEvent.press(screen.getByText("15 min"));
    fireEvent.press(screen.getByText("Save booking approval"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/orgs/org_1/booking-settings",
        {
          method: "PATCH",
          body: JSON.stringify({
            booking_approval_mode: "auto",
            membership_lease_approval_mode: "auto",
            payment_failure_hold_minutes: 15,
          }),
        },
        "token",
      );
    });
  }, 10000);

  it("updates a failed instant booking card and retries", async () => {
    mockRouteParams = { bookingId: "req_1" };
    const failedBooking = {
      public_id: "req_1",
      start_datetime: "2026-06-01T14:00:00Z",
      end_datetime: "2026-06-01T15:00:00Z",
      status: "payment_failed",
      payment_status: "failed",
      estimated_amount: 42,
      booking_public_id: null,
      space_public_id: "space_1",
      organization_name: "North Loop",
      instant_booking: true,
      failure_reason: "0",
      payment_hold_expires_at: "2099-06-01T14:30:00Z",
      payment_method_brand: "visa",
      payment_method_last4: "4242",
      payment_method_exp_month: 12,
      payment_method_exp_year: 2030,
    };
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/bookings/req_1") return Promise.reject(new Error("not booking"));
      if (path === "/api/booking-requests/req_1") return Promise.resolve(failedBooking);
      if (path === "/api/booking-requests/req_1/payment-method") return Promise.resolve({});
      if (path === "/api/booking-requests/req_1/retry-payment") return Promise.resolve({});
      return Promise.resolve([]);
    });

    const screen = render(<BookingDetailScreen />);

    expect(await screen.findByText("Payment failed")).toBeTruthy();
    fireEvent.press(screen.getByText("Update card and retry"));
    fireEvent.press(screen.getByText("Mock save card"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/booking-requests/req_1/payment-method",
        {
          method: "POST",
          body: JSON.stringify({
            member_owner_payment_method_public_id: "pm_new",
            payment_authorization_consent: true,
          }),
        },
        "token",
      );
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/booking-requests/req_1/retry-payment",
        { method: "POST", body: JSON.stringify({ operator_notes: null }) },
        "token",
      );
    });
  });

  it("filters member booking dates and times from availability", async () => {
    mockRouteParams = { spaceId: "space_1" };
    const today = new Date().toISOString().slice(0, 10);
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/spaces/space_1") {
        return Promise.resolve({
          public_id: "space_1",
          organization_name: "North Loop",
          booking_approval_mode: "auto",
          space_type: "conference_room",
          capacity: 6,
          price_daily: 200,
          availability_status: "available",
          availability_start_time: "09:00",
          availability_end_time: "18:00",
          buffer_before_minutes: 0,
          buffer_after_minutes: 0,
        });
      }
      if (path === "/api/spaces/space_1/media") return Promise.resolve([]);
      if (path.startsWith("/api/membership-plans/public")) return Promise.resolve([]);
      if (path.startsWith("/api/marketplace/spaces/space_1/availability")) {
        return Promise.resolve({
          space_public_id: "space_1",
          timezone: "UTC",
          granularity_minutes: 30,
          availability_start_time: "09:00",
          availability_end_time: "18:00",
          buffer_before_minutes: 0,
          buffer_after_minutes: 0,
          hourly_price: "50.00",
          daily_price: "200.00",
          days: [
            {
              date: today,
              fully_blocked: false,
              busy_intervals: [{ start: "09:00", end: "10:00" }],
            },
          ],
        });
      }
      return Promise.resolve([]);
    });

    const screen = render(<SpaceDetailScreen />);

    expect(await screen.findByText("Reserve & Pay")).toBeTruthy();
    expect(await screen.findByText("10:00")).toBeTruthy();
    expect(screen.queryByText("09:00")).toBeNull();
  });

  it("submits conference rooms as all-day bookings when selected", async () => {
    mockRouteParams = { spaceId: "space_1" };
    const today = new Date().toISOString().slice(0, 10);
    (apiFetch as jest.Mock).mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/spaces/space_1") {
        return Promise.resolve({
          public_id: "space_1",
          organization_name: "North Loop",
          booking_approval_mode: "auto",
          space_type: "conference_room",
          capacity: 6,
          price_hourly: 50,
          price_daily: 200,
          availability_status: "available",
          availability_start_time: "09:00",
          availability_end_time: "18:00",
          buffer_before_minutes: 0,
          buffer_after_minutes: 0,
        });
      }
      if (path === "/api/spaces/space_1/media") return Promise.resolve([]);
      if (path.startsWith("/api/membership-plans/public")) return Promise.resolve([]);
      if (path.startsWith("/api/marketplace/spaces/space_1/availability")) {
        return Promise.resolve({
          space_public_id: "space_1",
          timezone: "UTC",
          granularity_minutes: 30,
          availability_start_time: "09:00",
          availability_end_time: "18:00",
          buffer_before_minutes: 0,
          buffer_after_minutes: 0,
          hourly_price: "50.00",
          daily_price: "200.00",
          days: [{ date: today, fully_blocked: false, busy_intervals: [] }],
        });
      }
      if (path.startsWith("/api/payment-methods/resolve")) {
        return Promise.resolve({
          is_configured: true,
          has_payment_method: true,
          payment_method_public_id: "pm_1",
          message: null,
        });
      }
      if (path === "/api/booking-requests/preview") {
        return Promise.resolve({
          base_amount_cents: 20000,
          setup_fee_amount_cents: 2500,
          discount_amount_cents: 0,
          tax_amount_cents: 0,
          total_amount_cents: 22500,
          line_items: [
            { label: "Day Rate", amount_cents: 20000 },
            { label: "Room setup", amount_cents: 2500 },
          ],
        });
      }
      if (path === "/api/booking-requests") {
        return Promise.resolve({ public_id: "req_1", status: "approved", payment_status: "succeeded" });
      }
      return Promise.resolve([]);
    });

    const screen = render(<SpaceDetailScreen />);

    expect(await screen.findByText("Reserve & Pay")).toBeTruthy();
    fireEvent.press(screen.getByText("All day"));
    expect(await screen.findByText(/All day from/)).toBeTruthy();
    fireEvent.press(screen.getByText("Reserve & Pay"));
    expect(await screen.findByText("Checkout summary")).toBeTruthy();
    expect(screen.getByText("Room setup")).toBeTruthy();
    expect(screen.getByText("$225")).toBeTruthy();
    fireEvent.press(screen.getByText("Continue"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/booking-requests",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"booking_mode":"day_pass"'),
        }),
        "token",
      );
    });
  });
});
