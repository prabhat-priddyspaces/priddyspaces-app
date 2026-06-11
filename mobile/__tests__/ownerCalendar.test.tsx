import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerCalendarScreen } from "../src/screens/owner/OwnerCalendarScreen";
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

const bookingEvent = {
  kind: "booking",
  public_id: "evt_1",
  space_public_id: "space_1",
  space_name: "Board Room",
  space_type: "conference_room",
  location_public_id: "loc_1",
  location_name: "Rochester Hub",
  start: "2026-06-11T14:00:00Z",
  end: "2026-06-11T16:00:00Z",
  status: "booking.confirmed",
  payment_status: "paid",
  member: { public_id: "user_1", name: "Casey Member", email: "customer@test.com" },
  amount_cents: 15000,
  checked_in: null,
  no_show: null,
  request_kind: null,
  plan_name: null,
};

const subscriptionEvent = {
  ...bookingEvent,
  kind: "subscription",
  public_id: "evt_2",
  status: "subscription.active",
  plan_name: "Hot Desk Monthly",
  member: null,
};

const calendarResponse = {
  start: "2026-06-11T00:00:00Z",
  end: "2026-06-12T00:00:00Z",
  events: [bookingEvent, subscriptionEvent],
  spaces: [
    {
      public_id: "space_1",
      name: "Board Room",
      space_type: "conference_room",
      location_public_id: "loc_1",
      location_name: "Rochester Hub",
      location_timezone: "America/New_York",
    },
  ],
  truncated: false,
};

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string) => {
    if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1" }]);
    if (path === "/api/locations?organization_public_id=org_1") {
      return Promise.resolve([
        { public_id: "loc_1", name: "Rochester Hub" },
        { public_id: "loc_2", name: "Buffalo Outpost" },
      ]);
    }
    if (path.startsWith("/api/owner/calendar?")) return Promise.resolve(calendarResponse);
    return Promise.resolve([]);
  });
}

describe("OwnerCalendarScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    (apiFetch as jest.Mock).mockReset();
  });

  it("loads owner calendar events with member names and plan badges", async () => {
    mockApi();
    const { getByText, getAllByText } = render(<OwnerCalendarScreen />);

    await waitFor(() => expect(getByText("Casey Member")).toBeTruthy());
    expect(getAllByText("Board Room").length).toBe(2);
    expect(getByText("Hot Desk Monthly")).toBeTruthy();
    const calendarCall = (apiFetch as jest.Mock).mock.calls.find(([path]) =>
      String(path).startsWith("/api/owner/calendar?"),
    );
    expect(calendarCall[0]).toContain("start=");
    expect(calendarCall[0]).toContain("end=");
  });

  it("filters by location from the org's location list", async () => {
    mockApi();
    const { getByText, getByTestId } = render(<OwnerCalendarScreen />);

    await waitFor(() => expect(getByText("Buffalo Outpost")).toBeTruthy());
    fireEvent.press(getByTestId("owner-calendar-location-loc_2"));

    await waitFor(() => {
      const calls = (apiFetch as jest.Mock).mock.calls.filter(([path]) =>
        String(path).startsWith("/api/owner/calendar?"),
      );
      expect(calls[calls.length - 1][0]).toContain("location_public_id=loc_2");
    });
  });

  it("opens booking events in BookingDetail but not subscriptions", async () => {
    mockApi();
    const { getByTestId } = render(<OwnerCalendarScreen />);

    await waitFor(() => expect(getByTestId("owner-calendar-event-evt_1")).toBeTruthy());
    fireEvent.press(getByTestId("owner-calendar-event-evt_1"));
    expect(mockNavigate).toHaveBeenCalledWith("BookingDetail", { bookingId: "evt_1" });

    mockNavigate.mockClear();
    fireEvent.press(getByTestId("owner-calendar-event-evt_2"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("navigates to create booking", async () => {
    mockApi();
    const { getByLabelText } = render(<OwnerCalendarScreen />);

    await waitFor(() => expect(getByLabelText("Create booking")).toBeTruthy());
    fireEvent.press(getByLabelText("Create booking"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerCreateBooking");
  });

  it("surfaces calendar load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/orgs") return Promise.resolve([]);
      if (path.startsWith("/api/owner/calendar?")) {
        return Promise.reject(new Error("Failed to load calendar"));
      }
      return Promise.resolve([]);
    });

    const { getByText } = render(<OwnerCalendarScreen />);

    await waitFor(() => expect(getByText("Failed to load calendar")).toBeTruthy());
  });
});
