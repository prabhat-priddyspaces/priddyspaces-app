import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OwnerSettingsPage from "../app/owner/settings/page";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/organization-amenities-manager", () => ({
  OrganizationAmenitiesManager: () => <div />,
}));

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
}));

describe("OwnerSettingsPage booking approval settings", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/orgs" && init?.method === "GET") {
        return Promise.resolve([
          {
            public_id: "org_1",
            name: "North Loop",
            branding: null,
            review_status: "approved",
            review_notes: null,
            booking_approval_mode: "manual",
            membership_lease_approval_mode: "manual",
            payment_failure_hold_minutes: 30,
          },
        ]);
      }
      if (url === "/api/locations?organization_public_id=org_1") return Promise.resolve([]);
      if (url === "/api/orgs/org_1/booking-settings" && init?.method === "GET") {
        return Promise.resolve({
          public_id: "org_1",
          name: "North Loop",
          booking_approval_mode: "manual",
          membership_lease_approval_mode: "manual",
          payment_failure_hold_minutes: 30,
        });
      }
      if (url === "/api/orgs/org_1/booking-settings" && init?.method === "PATCH") {
        return Promise.resolve({
          public_id: "org_1",
          name: "North Loop",
          booking_approval_mode: "auto",
          membership_lease_approval_mode: "auto",
          payment_failure_hold_minutes: 15,
        });
      }
      if (url.startsWith("/api/promo-codes")) return Promise.resolve([]);
      if (url.startsWith("/api/tax-config")) return Promise.reject(new Error("not set"));
      if (url.startsWith("/api/cancellation-policies")) return Promise.resolve([]);
      if (url.startsWith("/api/subscription-plans")) return Promise.resolve([]);
      if (url.startsWith("/api/stripe/connect/status")) return Promise.resolve({ connected: false });
      return Promise.resolve([]);
    });
  });

  it("loads and saves organization booking approval settings", async () => {
    render(<OwnerSettingsPage />);

    expect(await screen.findByRole("link", { name: "Open loyalty settings" })).toHaveAttribute("href", "/owner/loyalty");
    expect(await screen.findByText("Booking approval")).toBeInTheDocument();
    expect(screen.queryByText("Feature flags")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Hourly/day-pass approval"), { target: { value: "auto" } });
    fireEvent.change(screen.getByLabelText("Membership & lease approval"), { target: { value: "auto" } });
    fireEvent.change(screen.getByLabelText("Payment failure recovery"), { target: { value: "15" } });
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
          }),
        },
        "token",
      );
    });
  });
});
