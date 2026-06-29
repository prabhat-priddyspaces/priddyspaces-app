import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OwnerBusinessProfilePage from "../app/owner/settings/page";

const { apiFetchMock, refreshOrgsMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  refreshOrgsMock: vi.fn(),
}));

const org = {
  public_id: "org_1",
  name: "North Loop",
  branding: "brand notes",
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
    refreshOrgs: refreshOrgsMock,
  }),
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

describe("OwnerBusinessProfilePage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    refreshOrgsMock.mockReset();
    apiFetchMock.mockResolvedValue({});
  });

  it("prefills and saves the organization profile", async () => {
    render(<OwnerBusinessProfilePage />);

    const nameInput = await screen.findByLabelText("Organization name");
    expect(nameInput).toHaveValue("North Loop");

    fireEvent.change(nameInput, { target: { value: "North Loop HQ" } });
    fireEvent.click(screen.getByRole("button", { name: "Save organization profile" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/orgs/org_1",
        {
          method: "PATCH",
          body: JSON.stringify({ name: "North Loop HQ", branding: "brand notes" }),
        },
        "token",
      );
    });
    expect(refreshOrgsMock).toHaveBeenCalled();
  });
});
