import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import MemberCalendarPage from "../app/member/calendar/page";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

function eventFor(overrides: Record<string, unknown>) {
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

const baseResponse = {
  start: "2026-06-01T00:00:00.000Z",
  end: "2026-06-02T00:00:00.000Z",
  truncated: false,
  spaces: [
    {
      public_id: "space_a",
      name: "Austin Room",
      space_type: "conference_room",
      location_public_id: "loc_a",
      location_name: "Austin",
      location_timezone: "UTC",
    },
    {
      public_id: "space_empty",
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
  ],
  events: [
    eventFor({ public_id: "booking_a" }),
    eventFor({
      public_id: "booking_b",
      space_public_id: "space_b",
      space_name: "Rochester Room",
      location_public_id: "loc_b",
      location_name: "Rochester",
    }),
  ],
};

describe("MemberCalendarPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string) => {
      const parsed = new URL(url, "http://localhost");
      if (parsed.searchParams.get("location_public_id") === "loc_b") {
        return Promise.resolve({
          ...baseResponse,
          spaces: baseResponse.spaces.filter((space) => space.location_public_id === "loc_b"),
          events: baseResponse.events.filter((event) => event.location_public_id === "loc_b"),
        });
      }
      return Promise.resolve(baseResponse);
    });
  });

  it("loads a personal day schedule and filters by location", async () => {
    render(<MemberCalendarPage />);

    expect(await screen.findByTestId("member-day-grid")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("calendar-date-input"), {
      target: { value: "2026-06-01" },
    });
    expect(await screen.findByTestId("calendar-event-booking_a")).toBeInTheDocument();
    expect(screen.getByTestId("calendar-event-booking_b")).toBeInTheDocument();
    expect(screen.queryByText("Unused Room")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("member-calendar-location-filter"), {
      target: { value: "loc_b" },
    });

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.stringContaining("location_public_id=loc_b"),
        { method: "GET" },
        "token"
      );
    });
    expect(await screen.findByTestId("calendar-event-booking_b")).toBeInTheDocument();
    expect(screen.queryByTestId("calendar-event-booking_a")).not.toBeInTheDocument();
  });
});
