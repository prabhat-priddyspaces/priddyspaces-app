import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MemberRequestsPage from "../app/member/requests/page";
import { apiFetch } from "../lib/api";

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../components/payment-method-modal", () => ({
  PaymentMethodModal: () => null,
}));

describe("MemberRequestsPage", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockImplementation((url: string) => {
      if (url === "/api/booking-waitlist") {
        return Promise.resolve([
          {
            public_id: "wait_1",
            created_at: "2026-05-29T21:41:00.000Z",
            status: "invited",
            space_public_id: "space_2",
            space_name: "Focus Room",
            space_type: "conference_room",
            organization_name: "Skyline Works",
            location_name: "Brooklyn Loft",
            location_city: "Brooklyn",
            membership_plan_name: null,
            request_kind: "hourly_booking",
            booking_mode: "hourly",
            seats_requested: 1,
            start_datetime: "2026-05-31T13:00:00.000Z",
            end_datetime: "2026-05-31T14:00:00.000Z",
            desired_start_date: null,
            invited_at: "2026-05-29T21:41:00.000Z",
            invite_expires_at: "2099-05-29T22:11:00.000Z",
            booking_href: "/spaces/space_2?waitlist=wait_1&date=2026-05-31&start_time=09:00&end_time=10:00",
          },
        ]);
      }
      return Promise.resolve([
        {
          public_id: "req_1",
          created_at: "2026-05-29T21:41:00.000Z",
          booking_id: null,
          booking_public_id: null,
          space_public_id: "space_1",
          space_name: "Bridge Meeting Room",
          space_type: "conference_room",
          organization_name: "Skyline Works",
          location_public_id: "loc_1",
          location_name: "Brooklyn Loft",
          location_address: "55 Washington St",
          location_city: "Brooklyn",
          location_state: "NY",
          location_postal_code: "11201",
          location_timezone: "America/New_York",
          location_public_phone: null,
          location_public_email: null,
          support_contacts: [],
          estimated_amount: { amount: 42, cents: 4200, currency: "USD" },
          start_datetime: "2026-05-30T13:00:00.000Z",
          end_datetime: "2026-05-30T14:00:00.000Z",
          status: "payment_failed",
          payment_status: "failed",
          payment_provider: "stripe",
          payment_method_brand: "visa",
          payment_method_last4: "4242",
          payment_method_exp_month: 12,
          payment_method_exp_year: 2030,
          instant_booking: true,
          approved_at: null,
          rejected_at: null,
          cancelled_at: null,
          cancellation_deadline_at: null,
          payment_hold_expires_at: "2099-05-29T22:11:00.000Z",
          payment_failed_at: "2026-05-29T21:41:00.000Z",
          booking_approval_mode: "auto",
          payment_failure_hold_minutes: 30,
          failure_reason: "0",
        },
      ]);
    });
  });

  it("shows useful failed-payment copy and hides provider labels", async () => {
    render(<MemberRequestsPage />);

    expect(await screen.findByText("Bridge Meeting Room")).toBeInTheDocument();
    expect(screen.getByText("Visa ending in 4242 · Expires 12/2030")).toBeInTheDocument();
    expect(screen.getByText(/payment processor declined the charge/i)).toBeInTheDocument();
    expect(screen.queryByText("stripe")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update card and retry" })).toBeInTheDocument();
    expect(screen.getByText("Waitlist • Conference Room • Brooklyn Loft • Brooklyn")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book now" })).toHaveAttribute("href", "/spaces/space_2?waitlist=wait_1&date=2026-05-31&start_time=09:00&end_time=10:00");
  });
});
