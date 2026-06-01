import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OwnerPaymentHealthPage from "../app/owner/payments/health/page";
import { apiFetch } from "../lib/api";

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
  getActiveImpersonationToken: vi.fn(() => null),
  clearAccessToken: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/owner/payments/health",
}));

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

const healthResponse = {
  generated_at: "2026-06-01T12:00:00.000Z",
  summary: {
    total_cards: 1,
    expired_count: 0,
    expiring_count: 1,
    missing_expiry_count: 0,
    healthy_count: 0,
    affected_member_count: 1,
    notices_sent_count: 0,
    upcoming_booking_value_cents: 17000,
    recent_paid_volume_cents: 20000,
  },
  results: [
    {
      public_id: "pm_health_1",
      organization_public_id: "org_1",
      organization_name: "Downtown Cowork",
      member_public_id: "member_1",
      member_name: "Riley Ortiz",
      member_email: "riley@example.com",
      provider: "stripe",
      payment_method_status: "active",
      card_status: "expiring",
      card_brand: "visa",
      card_last4: "4242",
      exp_month: 6,
      exp_year: 2026,
      expiry_label: "06/2026",
      is_default_for_owner: true,
      affected_spaces: [
        {
          space_public_id: "space_1",
          space_name: "Suite 201",
          space_type: "private_office",
          location_public_id: "loc_1",
          location_name: "Downtown Hub",
          location_city: "Miami",
          sources: ["open_request", "future_booking"],
          open_request_count: 1,
          future_booking_count: 1,
          active_subscription_count: 0,
        },
      ],
      open_booking_request_count: 1,
      future_booking_count: 1,
      active_subscription_count: 0,
      upcoming_booking_value_cents: 17000,
      recent_paid_volume_cents: 20000,
      last_notice: null,
      created_at: "2026-05-01T12:00:00.000Z",
      updated_at: "2026-06-01T12:00:00.000Z",
    },
  ],
};

function mockApi(empty = false) {
  vi.mocked(apiFetch).mockImplementation((url: string, options?: RequestInit) => {
    if (url === "/api/me") {
      return Promise.resolve({
        public_id: "owner_1",
        email: "owner@example.com",
        first_name: "Owner",
        last_name: "User",
        role: "owner",
        app_role: "owner",
        platform_role: null,
        has_organization: true,
        default_route: "/owner",
        impersonation: {
          is_impersonating: false,
          actor_public_id: null,
          actor_email: null,
          actor_platform_role: null,
          target_public_id: null,
          target_email: null,
          reason: null,
        },
      });
    }
    if (url === "/api/orgs") {
      return Promise.resolve([{ public_id: "org_1", name: "Downtown Cowork" }]);
    }
    if (url.startsWith("/api/locations")) {
      return Promise.resolve([{ public_id: "loc_1", name: "Downtown Hub", city: "Miami" }]);
    }
    if (url === "/api/owner/marketplace-readiness") {
      return Promise.resolve([]);
    }
    if (url.startsWith("/api/owner/payment-health/cards")) {
      return Promise.resolve(
        empty
          ? {
              ...healthResponse,
              summary: { ...healthResponse.summary, total_cards: 0, expiring_count: 0 },
              results: [],
            }
          : healthResponse,
      );
    }
    if (url === "/api/owner/payment-health/card-notices" && options?.method === "POST") {
      return Promise.resolve({
        sent_count: 1,
        skipped_count: 0,
        failed_count: 0,
        results: [
          {
            payment_method_public_id: "pm_health_1",
            member_email: "riley@example.com",
            status: "sent",
            reason: null,
            outbound_message_public_id: "out_1",
            outbound_status: "sent",
          },
        ],
      });
    }
    return Promise.resolve([]);
  });
}

describe("OwnerPaymentHealthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:payment-health"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("renders summary, filters, card rows, send action, and CSV export", async () => {
    mockApi();
    render(<OwnerPaymentHealthPage />);

    expect(await screen.findByRole("heading", { name: "Payment health" })).toBeInTheDocument();
    expect(await screen.findByText("Riley Ortiz")).toBeInTheDocument();
    expect(screen.getByText("Suite 201")).toBeInTheDocument();
    expect(screen.getAllByText("Expiring").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$170").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Card status"), { target: { value: "all" } });
    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        expect.stringContaining("status=all"),
        { method: "GET" },
        "token",
      );
    });

    fireEvent.click(screen.getByLabelText("Select riley@example.com"));
    fireEvent.click(screen.getByTestId("payment-health-send-selected"));
    await waitFor(() => expect(screen.getByText("1 sent")).toBeInTheDocument());
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
      "/api/owner/payment-health/card-notices",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("pm_health_1"),
      }),
      "token",
    );

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("renders the empty state", async () => {
    mockApi(true);
    render(<OwnerPaymentHealthPage />);

    expect(await screen.findByText("No saved member cards match these filters.")).toBeInTheDocument();
  });
});
