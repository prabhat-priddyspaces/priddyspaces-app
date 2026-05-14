import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { OwnerMemberDetailClient } from "../app/owner/members/[public_id]/client";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
  getActiveImpersonationToken: vi.fn(() => null),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ public_id: "member_1" }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/owner/members/member_1",
}));

function calendarEvent(overrides: Record<string, unknown>) {
  return {
    kind: "booking",
    public_id: "booking",
    space_public_id: "space",
    space_name: "Room",
    space_type: "conference_room",
    location_public_id: "loc_1",
    location_name: "Downtown",
    start: new Date().toISOString(),
    end: new Date().toISOString(),
    status: "booking.confirmed",
    payment_status: "succeeded",
    member: { public_id: "member_1", name: "Test Member", email: "member@example.com" },
    amount_cents: 4900,
    checked_in: false,
    no_show: false,
    request_kind: null,
    plan_name: null,
    ...overrides,
  };
}

describe("OwnerMemberDetailClient", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    const now = new Date();
    const pastStart = new Date(now);
    pastStart.setDate(now.getDate() - 1);
    pastStart.setHours(10, 0, 0, 0);
    const pastEnd = new Date(pastStart);
    pastEnd.setHours(11, 0, 0, 0);
    const futureStart = new Date(now);
    futureStart.setDate(now.getDate() + 1);
    futureStart.setHours(12, 0, 0, 0);
    const futureEnd = new Date(futureStart);
    futureEnd.setHours(13, 0, 0, 0);

    apiFetchMock.mockImplementation((url: string) => {
      if (url === "/api/owner/members/member_1") {
        return Promise.resolve({
          user_public_id: "member_1",
          organization_public_id: "org_1",
          name: "Test Member",
          email: "member@example.com",
          status: "active",
          phone: null,
          company_name: null,
          tags: [],
          notes: null,
          materialized: false,
          stats: {
            total_bookings: 2,
            confirmed_bookings: 2,
            canceled_bookings: 0,
            no_shows: 0,
            open_requests: 0,
            total_revenue_cents: 9800,
            active_subscriptions: 0,
            first_booking_at: pastStart.toISOString(),
            last_booking_at: futureStart.toISOString(),
          },
        });
      }
      if (url.startsWith("/api/owner/calendar")) {
        return Promise.resolve({
          start: pastStart.toISOString(),
          end: futureEnd.toISOString(),
          truncated: false,
          spaces: [],
          events: [
            calendarEvent({
              public_id: "booking_past",
              space_public_id: "space_past",
              space_name: "Past Room",
              start: pastStart.toISOString(),
              end: pastEnd.toISOString(),
            }),
            calendarEvent({
              public_id: "booking_future",
              space_public_id: "space_future",
              space_name: "Future Room",
              start: futureStart.toISOString(),
              end: futureEnd.toISOString(),
            }),
          ],
        });
      }
      return Promise.resolve([]);
    });
  });

  it("loads member-scoped calendar activity into upcoming and past tabs", async () => {
    render(<OwnerMemberDetailClient />);

    expect(await screen.findByText("Test Member")).toBeInTheDocument();
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.stringContaining("member_public_id=member_1"),
        { method: "GET" },
        "token",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Upcoming" }));
    expect(await screen.findByText("Future Room")).toBeInTheDocument();
    expect(screen.queryByText("Past Room")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Past" }));
    expect(await screen.findByText("Past Room")).toBeInTheDocument();
    expect(screen.queryByText("Future Room")).not.toBeInTheDocument();
  });
});
