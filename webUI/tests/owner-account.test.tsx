import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OwnerAccountPage from "../app/owner/account/page";

const { apiFetchMock, getAccessTokenMock, refreshMock, updateMeCacheMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  getAccessTokenMock: vi.fn(),
  refreshMock: vi.fn(),
  updateMeCacheMock: vi.fn(),
}));

const ownerMe = {
  public_id: "owner_1",
  email: "owner@example.com",
  first_name: "Owner",
  last_name: "User",
  phone: "555-0100",
  company_name: "Downtown Cowork",
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
};

vi.mock("@/hooks/useMe", () => ({
  useMe: () => ({
    me: ownerMe,
    loading: false,
    error: false,
    refresh: refreshMock,
  }),
  updateMeCache: updateMeCacheMock,
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("@/lib/auth", () => ({
  getAccessToken: getAccessTokenMock,
  getActiveImpersonationToken: vi.fn(() => null),
  clearAccessToken: vi.fn(),
}));

describe("OwnerAccountPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    getAccessTokenMock.mockReset();
    refreshMock.mockReset();
    updateMeCacheMock.mockReset();
  });

  it("saves owner profile fields through /api/me", async () => {
    getAccessTokenMock.mockReturnValue("token");
    apiFetchMock.mockResolvedValue({
      ...ownerMe,
      first_name: "Riley",
      phone: "555-0199",
    });

    render(<OwnerAccountPage />);

    expect(screen.getAllByRole("heading", { name: "Account" }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Email")).toHaveValue("owner@example.com");

    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Riley" },
    });
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "555-0199" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/me",
        expect.objectContaining({ method: "PATCH" }),
        "token"
      );
    });

    const payload = JSON.parse(apiFetchMock.mock.calls[0][1].body);
    expect(payload).toEqual({
      first_name: "Riley",
      last_name: "User",
      phone: "555-0199",
      company_name: "Downtown Cowork",
    });
    expect(updateMeCacheMock).toHaveBeenCalledWith(
      expect.objectContaining({ first_name: "Riley" }),
      "token"
    );
    expect(refreshMock).toHaveBeenCalled();
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
  });
});
