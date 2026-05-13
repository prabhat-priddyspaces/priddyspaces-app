import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSideNav } from "../components/admin-side-nav";
import { MemberSideNav } from "../components/member-side-nav";
import { PublicTopbar } from "../components/public-topbar";
import { SideNav } from "../components/side-nav";

const { apiFetchMock, appSignOutMock, getAccessTokenMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  appSignOutMock: vi.fn(),
  getAccessTokenMock: vi.fn(),
}));

vi.mock("@/hooks/useAppSignOut", () => ({
  useAppSignOut: () => appSignOutMock,
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("@/lib/auth", () => ({
  clearAccessToken: vi.fn(),
  getActiveImpersonationToken: vi.fn(() => null),
  getAccessToken: getAccessTokenMock,
}));

describe("logout flows", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    appSignOutMock.mockReset();
    getAccessTokenMock.mockReset();
  });

  it("signs out from the public topbar without leaving the current public page", async () => {
    getAccessTokenMock.mockReturnValue("token");
    apiFetchMock.mockResolvedValue({
      public_id: "member_1",
      email: "member@example.com",
      first_name: "Member",
      last_name: "User",
      role: "member",
      app_role: "member",
      platform_role: null,
      has_organization: false,
      default_route: "/spaces",
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
    appSignOutMock.mockImplementation(async (options) => {
      options?.onSignedOut?.();
    });

    render(<PublicTopbar />);

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(appSignOutMock).toHaveBeenCalledWith(
      expect.objectContaining({ redirectTo: null }),
    );
    await waitFor(() => {
      expect(document.body).toHaveTextContent("Sign in");
      expect(document.body).toHaveTextContent("Get started");
    });
  });

  it("routes protected shell logout buttons through shared app sign out", () => {
    appSignOutMock.mockResolvedValue(undefined);

    const owner = render(<SideNav />);
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    owner.unmount();

    const member = render(<MemberSideNav />);
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    member.unmount();

    render(<AdminSideNav platformRole="superadmin" />);
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    expect(appSignOutMock).toHaveBeenCalledTimes(3);
    expect(appSignOutMock.mock.calls).toEqual([[], [], []]);
  });
});
