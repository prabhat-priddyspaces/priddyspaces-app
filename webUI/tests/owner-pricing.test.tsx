import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OwnerPricingPage from "../app/owner/settings/pricing/page";

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

describe("OwnerPricingPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith("/api/promo-codes")) return Promise.resolve([]);
      // No tax config exists yet on load (GET), but saving (POST) succeeds.
      if (url.startsWith("/api/tax-config")) {
        return init?.method === "POST"
          ? Promise.resolve({ public_id: "tax_1", rate_percent: 8.5 })
          : Promise.reject(new Error("not set"));
      }
      return Promise.resolve({});
    });
  });

  it("saves the tax rate", async () => {
    render(<OwnerPricingPage />);

    const rateInput = await screen.findByLabelText("Tax rate (%)");
    fireEvent.change(rateInput, { target: { value: "8.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save tax" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/tax-config?organization_public_id=org_1",
        {
          method: "POST",
          body: JSON.stringify({ rate_percent: 8.5 }),
        },
        "token",
      );
    });
  });

  it("creates a promo code", async () => {
    render(<OwnerPricingPage />);

    fireEvent.change(await screen.findByLabelText("Code"), { target: { value: "spring" } });
    fireEvent.change(screen.getByLabelText("Discount value"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Add promo" }));

    await waitFor(() => {
      expect(
        apiFetchMock.mock.calls.some(
          ([url, init]) =>
            url === "/api/promo-codes?organization_public_id=org_1" &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true);
    });
    // Code input force-uppercases entries.
    const postCall = apiFetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/promo-codes?organization_public_id=org_1" &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    const body = JSON.parse((postCall?.[1] as RequestInit).body as string);
    expect(body.code).toBe("SPRING");
    expect(body.discount_type).toBe("percent");
    expect(body.discount_value).toBe(20);
  });
});
