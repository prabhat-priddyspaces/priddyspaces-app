import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerBookingsScreen } from "../src/screens/owner/OwnerBookingsScreen";
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

const requests = [
  {
    public_id: "req_1",
    start_datetime: "2026-06-12T10:00:00Z",
    end_datetime: "2026-06-12T12:00:00Z",
    status: "requested",
    booking_approval_mode: "manual",
    operator_notes: null,
  },
  {
    public_id: "req_2",
    start_datetime: "2026-06-13T10:00:00Z",
    end_datetime: "2026-06-13T12:00:00Z",
    status: "payment_failed",
    payment_hold_expires_at: null,
  },
];

describe("OwnerBookingsScreen request decisions", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    (apiFetch as jest.Mock).mockReset();
  });

  it("approves a pending request with operator notes and reloads", async () => {
    let approved = false;
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/booking-requests" && options?.method === "GET") {
        return Promise.resolve(approved ? [requests[1]] : requests);
      }
      if (path === "/api/booking-requests/req_1/approve" && options?.method === "POST") {
        approved = true;
        return Promise.resolve({ public_id: "req_1", status: "approved" });
      }
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText, queryByText } = render(<OwnerBookingsScreen />);

    await waitFor(() => expect(getByLabelText("Approve req_1")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Operator notes for req_1"), "See you at 10");
    fireEvent.press(getByLabelText("Approve req_1"));

    await waitFor(() => expect(getByText("Request approved")).toBeTruthy());
    const approveCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/booking-requests/req_1/approve" && options?.method === "POST",
    );
    expect(JSON.parse(approveCall[1].body)).toEqual({ operator_notes: "See you at 10" });
    // Approved request leaves the pending list after reload.
    await waitFor(() => expect(queryByText("requested")).toBeNull());
  });

  it("rejects only after inline confirmation", async () => {
    let rejected = false;
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/booking-requests" && options?.method === "GET") {
        return Promise.resolve(rejected ? [] : [requests[0]]);
      }
      if (path === "/api/booking-requests/req_1/reject" && options?.method === "POST") {
        rejected = true;
        return Promise.resolve({ public_id: "req_1", status: "rejected" });
      }
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText, queryByLabelText } = render(<OwnerBookingsScreen />);

    await waitFor(() => expect(getByLabelText("Reject req_1")).toBeTruthy());
    fireEvent.press(getByLabelText("Reject req_1"));

    // First tap only reveals the confirm step — no API call yet.
    expect(getByText("Reject this request?")).toBeTruthy();
    expect(
      (apiFetch as jest.Mock).mock.calls.filter(([path]) => path.includes("/reject")).length,
    ).toBe(0);

    fireEvent.press(getByLabelText("Confirm reject req_1"));
    await waitFor(() => expect(getByText("Request rejected")).toBeTruthy());
    const rejectCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/booking-requests/req_1/reject" && options?.method === "POST",
    );
    expect(JSON.parse(rejectCall[1].body)).toEqual({ operator_notes: null });
  });

  it("cancels an in-progress reject confirmation", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/booking-requests" && options?.method === "GET") {
        return Promise.resolve([requests[0]]);
      }
      return Promise.resolve([]);
    });

    const { getByLabelText, queryByText } = render(<OwnerBookingsScreen />);

    await waitFor(() => expect(getByLabelText("Reject req_1")).toBeTruthy());
    fireEvent.press(getByLabelText("Reject req_1"));
    fireEvent.press(getByLabelText("Cancel reject req_1"));

    expect(queryByText("Reject this request?")).toBeNull();
    expect(getByLabelText("Approve req_1")).toBeTruthy();
    expect(
      (apiFetch as jest.Mock).mock.calls.filter(([path]) => path.includes("/reject")).length,
    ).toBe(0);
  });

  it("shows the API error when a decision fails", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/booking-requests" && options?.method === "GET") {
        return Promise.resolve([requests[0]]);
      }
      if (path === "/api/booking-requests/req_1/approve" && options?.method === "POST") {
        return Promise.reject(new Error("Space is no longer available"));
      }
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText } = render(<OwnerBookingsScreen />);

    await waitFor(() => expect(getByLabelText("Approve req_1")).toBeTruthy());
    fireEvent.press(getByLabelText("Approve req_1"));

    await waitFor(() => expect(getByText("Space is no longer available")).toBeTruthy());
  });

  it("filters requests by status like web", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/booking-requests" && options?.method === "GET") {
        return Promise.resolve([
          requests[0],
          { ...requests[1], public_id: "req_9", status: "approved" },
        ]);
      }
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText, queryByText } = render(<OwnerBookingsScreen />);

    await waitFor(() => expect(getByText("requested")).toBeTruthy());
    expect(getByText("approved")).toBeTruthy();

    fireEvent.press(getByLabelText("Filter Approved"));
    expect(queryByText("requested")).toBeNull();
    expect(getByText("approved")).toBeTruthy();

    fireEvent.press(getByLabelText("Filter Rejected"));
    expect(getByText("No booking requests match this filter.")).toBeTruthy();
  });

  it("invites a waitlisted member with operator notes", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/booking-requests" && options?.method === "GET") return Promise.resolve([]);
      if (path === "/api/booking-waitlist" && options?.method === "GET") {
        return Promise.resolve([
          {
            public_id: "wl_1",
            status: "waitlisted",
            member_name: "Casey Member",
            member_email: "customer@test.com",
            membership_plan_name: null,
            space_name: "Board Room",
            space_type: "conference_room",
            location_name: "Rochester Hub",
            desired_start_date: "2026-07-01",
            start_datetime: null,
            end_datetime: null,
            invite_expires_at: null,
            operator_notes: null,
          },
        ]);
      }
      if (path === "/api/booking-waitlist/wl_1/invite" && options?.method === "POST") {
        return Promise.resolve({});
      }
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText } = render(<OwnerBookingsScreen />);

    await waitFor(() => expect(getByText("Casey Member")).toBeTruthy());
    expect(getByText("Desired start 2026-07-01")).toBeTruthy();
    fireEvent.changeText(getByLabelText("Operator notes for wl_1"), "Front desk will greet you");
    fireEvent.press(getByLabelText("Invite wl_1"));

    await waitFor(() => expect(getByText("Waitlist invite sent")).toBeTruthy());
    const inviteCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/booking-waitlist/wl_1/invite" && options?.method === "POST",
    );
    expect(JSON.parse(inviteCall[1].body)).toEqual({ operator_notes: "Front desk will greet you" });
  });

  it("resends failed booking emails", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/booking-requests" && options?.method === "GET") {
        return Promise.resolve([
          {
            ...requests[0],
            email_delivery_summary: [
              {
                notification_type: "booking_confirmation",
                label: "Booking confirmation",
                status: "failed",
                recipient_count: 1,
                last_error: "Mailbox unavailable",
                recipients: ["customer@test.com"],
              },
              {
                notification_type: "owner_alert",
                label: "Owner alert",
                status: "delivered",
                recipient_count: 1,
                last_error: null,
                recipients: [],
              },
            ],
          },
        ]);
      }
      if (
        path === "/api/booking-requests/req_1/emails/resend" &&
        options?.method === "POST"
      ) {
        return Promise.resolve({});
      }
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText, queryByLabelText } = render(<OwnerBookingsScreen />);

    await waitFor(() => expect(getByText("Booking confirmation")).toBeTruthy());
    expect(getByText("Mailbox unavailable")).toBeTruthy();
    // Delivered emails offer no resend.
    expect(queryByLabelText("Resend owner_alert for req_1")).toBeNull();

    fireEvent.press(getByLabelText("Resend booking_confirmation for req_1"));
    await waitFor(() => expect(getByText("Email resent")).toBeTruthy());
    const resendCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) =>
        path === "/api/booking-requests/req_1/emails/resend" && options?.method === "POST",
    );
    expect(JSON.parse(resendCall[1].body)).toEqual({ notification_type: "booking_confirmation" });
  });

  it("offers no decision buttons on payment_failed requests", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/booking-requests" && options?.method === "GET") {
        return Promise.resolve([requests[1]]);
      }
      return Promise.resolve([]);
    });

    const { getByText, queryByLabelText } = render(<OwnerBookingsScreen />);

    await waitFor(() => expect(getByText("payment_failed")).toBeTruthy());
    expect(queryByLabelText("Approve req_2")).toBeNull();
    expect(queryByLabelText("Reject req_2")).toBeNull();
  });
});
