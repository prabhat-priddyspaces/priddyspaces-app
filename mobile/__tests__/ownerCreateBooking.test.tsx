import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerCreateBookingScreen } from "../src/screens/owner/OwnerCreateBookingScreen";
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

const locations = [{ public_id: "loc_1", name: "Austin Hub", city: "Austin" }];
const spaces = [{ public_id: "space_1", name: "Board Room", space_type: "conference_room", capacity: 6 }];

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
    if (path === "/api/locations") return Promise.resolve(locations);
    if (path === "/api/locations/loc_1/spaces") return Promise.resolve(spaces);
    if (path === "/api/owner/bookings/preview") {
      return Promise.resolve({ total_amount_cents: 10000, base_amount_cents: 10000, rate_basis: "hourly" });
    }
    if (path === "/api/owner/bookings") {
      const body = JSON.parse(String(options?.body || "{}"));
      return Promise.resolve({
        request_public_id: "req_1",
        booking_public_id: body.payment_collection_mode === "cash_collected" ? "booking_1" : null,
        payment_collection_mode: body.payment_collection_mode,
        payment_link_expires_at:
          body.payment_collection_mode === "payment_link" ? "2026-07-15T12:30:00.000Z" : null,
        member_email: body.member?.email || "casey@example.com",
        total_amount_cents: 10000,
      });
    }
    return Promise.resolve([]);
  });
}

describe("OwnerCreateBookingScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    (apiFetch as jest.Mock).mockReset();
    mockApi();
  });

  it("creates a cash booking for a new member", async () => {
    const { getByLabelText, getByText } = render(<OwnerCreateBookingScreen />);

    await waitFor(() => expect(getByText("Austin Hub")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Date"), "2026-07-15");
    fireEvent.changeText(getByLabelText("Full name"), "Walk In");
    fireEvent.changeText(getByLabelText("Email"), "walkin@example.com");
    fireEvent.press(getByText("Confirm cash booking"));

    await waitFor(() => expect(getByText("Cash booking confirmed")).toBeTruthy());
    const createCall = (apiFetch as jest.Mock).mock.calls.find(([path]) => path === "/api/owner/bookings");
    expect(JSON.parse(createCall[1].body)).toMatchObject({
      space_public_id: "space_1",
      payment_collection_mode: "cash_collected",
      member: { email: "walkin@example.com", full_name: "Walk In" },
    });
  });

  it("sends a payment link payload and shows the hold state", async () => {
    const { getByLabelText, getByText } = render(<OwnerCreateBookingScreen />);

    await waitFor(() => expect(getByText("Austin Hub")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Date"), "2026-07-15");
    fireEvent.changeText(getByLabelText("Full name"), "Link Member");
    fireEvent.changeText(getByLabelText("Email"), "link@example.com");
    fireEvent.press(getByText("Payment link"));
    fireEvent.press(getByText("Send payment link"));

    await waitFor(() => expect(getByText("Payment link sent")).toBeTruthy());
    expect(getByText(/Hold expires/)).toBeTruthy();
    const createCall = (apiFetch as jest.Mock).mock.calls.find(([path]) => path === "/api/owner/bookings");
    expect(JSON.parse(createCall[1].body)).toMatchObject({
      payment_collection_mode: "payment_link",
      member: { email: "link@example.com", full_name: "Link Member" },
    });
  });
});
