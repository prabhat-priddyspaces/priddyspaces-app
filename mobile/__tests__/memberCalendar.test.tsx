import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { MemberCalendarScreen } from "../src/screens/MemberCalendarScreen";
import { apiFetch } from "../src/lib/api";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

function calendarEvent(overrides: Record<string, unknown>) {
  return {
    kind: "booking",
    public_id: "booking_a",
    space_public_id: "space_a",
    space_name: "Austin Room",
    space_type: "conference_room",
    location_public_id: "loc_a",
    location_name: "Austin",
    start: "2026-06-01T09:00:00.000Z",
    end: "2026-06-01T18:00:00.000Z",
    status: "booking.confirmed",
    payment_status: "succeeded",
    member: { public_id: "member_1", name: "Test Member", email: "member@example.com" },
    amount_cents: 10000,
    checked_in: false,
    no_show: false,
    request_kind: null,
    plan_name: null,
    ...overrides,
  };
}

const spaces = [
  {
    public_id: "space_a",
    name: "Austin Room",
    space_type: "conference_room",
    location_public_id: "loc_a",
    location_name: "Austin",
    location_timezone: "UTC",
  },
  {
    public_id: "space_unused",
    name: "Unused Room",
    space_type: "conference_room",
    location_public_id: "loc_a",
    location_name: "Austin",
    location_timezone: "UTC",
  },
  {
    public_id: "space_b",
    name: "Rochester Room",
    space_type: "conference_room",
    location_public_id: "loc_b",
    location_name: "Rochester",
    location_timezone: "UTC",
  },
];

const allLocationsResponse = {
  start: "2026-06-01T00:00:00.000Z",
  end: "2026-06-02T00:00:00.000Z",
  truncated: false,
  spaces,
  events: [
    calendarEvent({ public_id: "booking_a" }),
    calendarEvent({
      public_id: "booking_b",
      space_public_id: "space_b",
      space_name: "Rochester Room",
      location_public_id: "loc_b",
      location_name: "Rochester",
    }),
  ],
};

describe("MemberCalendarScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path.includes("location_public_id=loc_b")) {
        return Promise.resolve({
          ...allLocationsResponse,
          spaces: spaces.filter((space) => space.location_public_id === "loc_b"),
          events: allLocationsResponse.events.filter((event) => event.location_public_id === "loc_b"),
        });
      }
      return Promise.resolve(allLocationsResponse);
    });
  });

  it("renders member-owned calendar events and filters by location", async () => {
    const screen = render(<MemberCalendarScreen />);

    expect(await screen.findByText("Austin Room")).toBeTruthy();
    expect(screen.getByText("Rochester Room")).toBeTruthy();
    expect(screen.queryByText("Unused Room")).toBeNull();

    fireEvent.press(screen.getByTestId("mobile-calendar-location-loc_b"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining("location_public_id=loc_b"),
        { method: "GET" },
        "token"
      );
    });
    expect(await screen.findByText("Rochester Room")).toBeTruthy();
    expect(screen.queryByText("Austin Room")).toBeNull();
  });
});
