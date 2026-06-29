import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OwnerBookingRulesPage from "../app/owner/settings/booking/page";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

const org = {
  public_id: "org_1",
  name: "North Loop",
  branding: null,
  review_status: "approved",
  review_notes: null,
};

vi.mock("@/app/owner/settings/_components/owner-org-provider", () => ({
  useOwnerOrg: () => ({
    orgs: [org],
    orgId: "org_1",
    setOrgId: vi.fn(),
    selectedOrg: org,
    loading: false,
    error: null,
    refreshOrgs: vi.fn(),
  }),
}));

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
}));

describe("OwnerBookingRulesPage booking approval settings", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/orgs/org_1/booking-settings" && init?.method === "GET") {
        return Promise.resolve({
          public_id: "org_1",
          name: "North Loop",
          booking_approval_mode: "manual",
          membership_lease_approval_mode: "manual",
          payment_failure_hold_minutes: 30,
          waitlist_enabled: false,
          waitlist_conference_room_enabled: false,
          waitlist_private_office_enabled: false,
          waitlist_shared_desk_enabled: false,
          waitlist_suite_enabled: false,
          waitlist_virtual_office_enabled: false,
        });
      }
      if (url === "/api/orgs/org_1/booking-settings" && init?.method === "PATCH") {
        return Promise.resolve({
          public_id: "org_1",
          name: "North Loop",
          booking_approval_mode: "auto",
          membership_lease_approval_mode: "auto",
          payment_failure_hold_minutes: 15,
          waitlist_enabled: true,
          waitlist_conference_room_enabled: true,
          waitlist_private_office_enabled: true,
          waitlist_shared_desk_enabled: true,
          waitlist_suite_enabled: true,
          waitlist_virtual_office_enabled: true,
        });
      }
      if (url.startsWith("/api/cancellation-policies")) return Promise.resolve([]);
      return Promise.resolve([]);
    });
  });

  it("loads and saves organization booking approval settings", async () => {
    render(<OwnerBookingRulesPage />);

    expect(await screen.findByText("Booking approval")).toBeInTheDocument();
    // The booking-rules page must not pull in unrelated settings or their data.
    expect(screen.queryByText("Feature flags")).not.toBeInTheDocument();
    expect(screen.queryByText("Pricing rules")).not.toBeInTheDocument();
    expect(screen.queryByText("Stripe Connect")).not.toBeInTheDocument();
    expect(screen.queryByText("Membership plans")).not.toBeInTheDocument();
    expect(screen.queryByText("Promo codes")).not.toBeInTheDocument();
    expect(screen.queryByText("Tax configuration")).not.toBeInTheDocument();
    expect(apiFetchMock.mock.calls.some(([url]) => String(url).includes("/api/pricing-rules"))).toBe(false);
    expect(apiFetchMock.mock.calls.some(([url]) => String(url).includes("/api/stripe/connect"))).toBe(false);
    expect(apiFetchMock.mock.calls.some(([url]) => String(url).includes("/api/promo-codes"))).toBe(false);
    expect(apiFetchMock.mock.calls.some(([url]) => String(url).includes("/api/tax-config"))).toBe(false);

    fireEvent.change(screen.getByLabelText("Hourly/day-pass approval"), { target: { value: "auto" } });
    fireEvent.change(screen.getByLabelText("Membership & lease approval"), { target: { value: "auto" } });
    fireEvent.change(screen.getByLabelText("Payment failure recovery"), { target: { value: "15" } });
    for (const label of ["Conference room", "Private office", "Shared desk", "Suite", "Virtual office"]) {
      fireEvent.click(screen.getByLabelText(label));
    }
    fireEvent.click(screen.getByRole("button", { name: "Save booking approval" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/orgs/org_1/booking-settings",
        {
          method: "PATCH",
          body: JSON.stringify({
            booking_approval_mode: "auto",
            membership_lease_approval_mode: "auto",
            payment_failure_hold_minutes: 15,
            waitlist_conference_room_enabled: true,
            waitlist_private_office_enabled: true,
            waitlist_shared_desk_enabled: true,
            waitlist_suite_enabled: true,
            waitlist_virtual_office_enabled: true,
          }),
        },
        "token",
      );
    });
  });
});
