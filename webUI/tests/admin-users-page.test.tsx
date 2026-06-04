import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import AdminUsersPage from "../app/admin/users/page";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn((path: string) => {
    if (path === "/api/me") {
      return Promise.resolve({
        public_id: "admin-1",
        email: "admin@example.com",
        first_name: "Admin",
        last_name: "User",
        role: null,
        app_role: null,
        platform_role: "superadmin",
        default_route: "/admin",
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
    if (path.startsWith("/api/admin/users")) {
      return Promise.resolve({
        results: [
          {
            public_id: "member_1",
            email: "member@example.com",
            name: "Member User",
            role: "member",
            app_role: "member",
            platform_role: null,
            is_active: true,
            email_verified: true,
            created_at: "2026-05-01T12:00:00.000Z",
            last_activity_at: "2026-05-02T12:00:00.000Z",
            organization_count: 0,
            bookings: 2,
            payments: 1,
            subscriptions: 1,
          },
          {
            public_id: "owner_1",
            email: "owner@example.com",
            name: "Owner User",
            role: "owner",
            app_role: "owner",
            platform_role: null,
            is_active: true,
            email_verified: false,
            created_at: "2026-05-01T12:00:00.000Z",
            last_activity_at: null,
            organization_count: 1,
            bookings: 0,
            payments: 0,
            subscriptions: 0,
          },
        ],
        total: 2,
        page: 1,
        page_size: 25,
      });
    }
    if (path === "/api/admin/owner-invites") {
      return Promise.resolve({
        public_id: "owner_invited",
        email: "invited@example.com",
        name: "Invited Owner",
        role: "owner",
        is_active: true,
        email_verified: false,
      });
    }
    return Promise.reject(new Error(`Unexpected API path ${path}`));
  }),
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
  getActiveImpersonationToken: vi.fn(() => null),
}));

describe("AdminUsersPage", () => {
  it("renders all-user rows and links known app roles to detail pages", async () => {
    render(<AdminUsersPage />);

    expect((await screen.findAllByRole("heading", { name: "Users" })).length).toBeGreaterThan(0);
    expect(await screen.findByText("Member User")).toBeInTheDocument();
    expect(screen.getByText("Owner User")).toBeInTheDocument();
    expect(screen.getByTestId("admin-users-count")).toHaveTextContent("2 users");
    expect(screen.getByRole("link", { name: "Member User" })).toHaveAttribute(
      "href",
      "/admin/members/member_1"
    );
    expect(screen.getByRole("link", { name: "Owner User" })).toHaveAttribute(
      "href",
      "/admin/owner-users/owner_1"
    );
  });

  it("lets superadmins send owner invites from basic account info", async () => {
    const { apiFetch } = await import("../lib/api");

    render(<AdminUsersPage />);

    fireEvent.change(await screen.findByLabelText("Owner email"), {
      target: { value: "invited@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Owner first name"), {
      target: { value: "Invited" },
    });
    fireEvent.change(screen.getByLabelText("Owner last name"), {
      target: { value: "Owner" },
    });
    fireEvent.change(screen.getByLabelText("Owner phone"), {
      target: { value: "+1 555 111 2222" },
    });
    // Input strips formatting and caps at 10 digits before submit.
    fireEvent.change(screen.getByLabelText("Owner business name"), {
      target: { value: "Invited Works" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send owner invite" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/admin/owner-invites",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            email: "invited@example.com",
            first_name: "Invited",
            last_name: "Owner",
            phone: "1555111222",
            company_name: "Invited Works",
          }),
        }),
        "token"
      );
    });
    expect(await screen.findByText("Owner invite sent.")).toBeInTheDocument();
  });
});
