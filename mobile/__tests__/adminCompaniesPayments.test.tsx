import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { AdminOwnerCompaniesScreen } from "../src/screens/admin/AdminOwnerCompaniesScreen";
import { AdminPaymentsScreen } from "../src/screens/admin/AdminPaymentsScreen";
import { apiFetch } from "../src/lib/api";

let mockMe: Record<string, unknown> = { platform_role: "admin" };

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token", me: mockMe }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const company = {
  public_id: "org_1",
  name: "Acme Coworking LLC",
  display_name: "Acme Coworking",
  business_email: "hello@acme.com",
  review_status: "pending",
  review_notes: null,
  commission_override_pct: null,
  payment_status: "ready",
  payment_blockers: [],
  marketplace_visible_listings: 5,
  payment_hidden_listings: 1,
  locations: 2,
  listings: 6,
  owner: { email: "owner@test.com", name: "Olive Owner" },
};

describe("AdminOwnerCompaniesScreen", () => {
  beforeEach(() => {
    mockMe = { platform_role: "admin" };
    (apiFetch as jest.Mock).mockReset();
  });

  it("approves a company with notes and commission override", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (String(path).startsWith("/api/admin/owner-companies") && (options?.method || "GET") === "GET") {
        return Promise.resolve([company]);
      }
      if (path === "/api/admin/owner-companies/org_1" && options?.method === "PATCH") {
        return Promise.resolve({});
      }
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText } = render(<AdminOwnerCompaniesScreen />);

    await waitFor(() => expect(getByText("Acme Coworking")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Review notes org_1"), "Looks good");
    fireEvent.changeText(getByLabelText("Commission override org_1"), "12");
    fireEvent.press(getByLabelText("Approve org_1"));

    await waitFor(() => {
      const patchCall = (apiFetch as jest.Mock).mock.calls.find(
        ([path, options]) => path === "/api/admin/owner-companies/org_1" && options?.method === "PATCH",
      );
      expect(patchCall).toBeTruthy();
      expect(JSON.parse(patchCall[1].body)).toEqual({
        review_status: "approved",
        review_notes: "Looks good",
        commission_override_pct: 12,
      });
    });
  });

  it("hides review controls for non-admin platform roles", async () => {
    mockMe = { platform_role: "moderator" };
    (apiFetch as jest.Mock).mockResolvedValue([company]);

    const { queryByLabelText, getByText } = render(<AdminOwnerCompaniesScreen />);

    await waitFor(() => expect(getByText("Acme Coworking")).toBeTruthy());
    expect(queryByLabelText("Approve org_1")).toBeNull();
  });
});

describe("AdminPaymentsScreen", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it("renders platform payment summary and ledger", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({
      summary: { gmv: 250000, platform_earnings: 32000, owner_net: 218000, failed_payments: 4 },
      results: [
        {
          public_id: "pay_1",
          status: "succeeded",
          amount: 0,
          amount_cents: 20000,
          provider: "stripe",
          failure_reason: null,
          platform_fee_amount: 20,
          owner_net_amount: 180,
          member_name: "Casey Member",
          member_email: null,
          organization_name: "Priddyspaces",
          space_name: "Board Room",
          location_name: "Rochester Hub",
          created_at: "2026-06-11T10:00:00Z",
        },
      ],
    });

    const { getByText } = render(<AdminPaymentsScreen />);

    await waitFor(() => expect(getByText("$250,000")).toBeTruthy());
    expect(getByText("$200 • succeeded")).toBeTruthy();
    expect(getByText("Casey Member • Priddyspaces")).toBeTruthy();
  });
});
