import { describe, expect, it } from "vitest";

import { CalendarEvent, CalendarSpace, groupCalendarSlotEvents } from "../lib/calendar";

const sharedDesk: CalendarSpace = {
  public_id: "space_shared",
  name: "Shared Desk",
  space_type: "shared_desk",
  location_public_id: "loc_1",
  location_name: "Rochester",
  location_timezone: "UTC",
  capacity: 10,
};

function eventFor(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    kind: "booking",
    public_id: "booking_1",
    space_public_id: sharedDesk.public_id,
    space_name: sharedDesk.name,
    space_type: sharedDesk.space_type,
    location_public_id: sharedDesk.location_public_id,
    location_name: sharedDesk.location_name,
    start: "2026-06-01T09:00:00.000Z",
    end: "2026-06-01T18:00:00.000Z",
    status: "booking.confirmed",
    payment_status: "succeeded",
    member: { public_id: "member_1", name: "Member One", email: "one@example.com" },
    amount_cents: 50000,
    checked_in: false,
    no_show: false,
    request_kind: "daily_booking",
    plan_name: null,
    seats_requested: 1,
    ...overrides,
  };
}

describe("groupCalendarSlotEvents", () => {
  it("rolls up booked and pending records for one space and time", () => {
    const groups = groupCalendarSlotEvents(
      [
        eventFor({ public_id: "booking_1", member: { public_id: "m1", name: "One", email: "one@example.com" } }),
        eventFor({ public_id: "booking_2", member: { public_id: "m2", name: "Two", email: "two@example.com" } }),
        eventFor({ public_id: "booking_3", member: { public_id: "m3", name: "Three", email: "three@example.com" } }),
        eventFor({
          kind: "request",
          public_id: "request_1",
          status: "request.requested",
          payment_status: "not_charged",
          member: { public_id: "m4", name: "Four", email: "four@example.com" },
        }),
      ],
      [sharedDesk]
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("3 booked • 1 pending");
    expect(groups[0].detailLabel).toBe("4/10 seats");
    expect(groups[0].tone).toBe("mixed");
  });

  it("prioritizes payment issue state when a failed payment exists", () => {
    const groups = groupCalendarSlotEvents(
      [
        eventFor({ public_id: "booking_1" }),
        eventFor({
          kind: "request",
          public_id: "request_failed",
          status: "request.payment_failed",
          payment_status: "failed",
          member: { public_id: "m2", name: "Two", email: "two@example.com" },
        }),
      ],
      [sharedDesk]
    );

    expect(groups[0].label).toBe("Payment issue • 1 booked");
    expect(groups[0].tone).toBe("payment_issue");
  });
});
