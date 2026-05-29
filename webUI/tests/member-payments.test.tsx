import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MemberPaymentsPage from "../app/member/payments/page";
import { apiFetch } from "../lib/api";

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("../lib/invoice-download", () => ({
  downloadInvoicePdf: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

describe("MemberPaymentsPage", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockImplementation((url: string) => {
      if (url === "/api/payments") return Promise.resolve([]);
      if (url === "/api/invoices") return Promise.resolve([]);
      if (url === "/api/payment-methods") {
        return Promise.resolve([
          {
            public_id: "pm_1",
            organization_public_id: "org_1",
            organization_name: "Skyline Works",
            provider: "stripe",
            last4: "4242",
            brand: "visa",
            exp_month: 12,
            exp_year: 2030,
            is_default_for_owner: true,
            status: "active",
            billing_name: "Test User",
            created_at: null,
          },
        ]);
      }
      return Promise.resolve([]);
    });
  });

  it("shows owner-scoped booking payment methods separately from membership billing", async () => {
    render(<MemberPaymentsPage />);

    expect(await screen.findByText("Booking payment methods")).toBeInTheDocument();
    expect(await screen.findByText("Visa ending in 4242")).toBeInTheDocument();
    expect(screen.getByText(/Membership billing is managed from this page\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Membership billing" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Marketplace" })).not.toBeInTheDocument();
  });
});
