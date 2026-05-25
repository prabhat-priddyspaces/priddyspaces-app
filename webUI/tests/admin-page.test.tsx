import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import AdminDashboard from "../app/admin/page";

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
          reason: null
        }
      });
    }
    return Promise.resolve({
      metrics: {
        tenants: 1,
        users: 2,
        members: 1,
        owner_companies: 1,
        live_listings: 4,
        bookings: 3,
        booking_requests: 4,
        gmv: 1200,
        platform_earnings: 120,
      },
      recent_activity: []
    });
  })
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
  getActiveImpersonationToken: vi.fn(() => null)
}));

describe("AdminDashboard", () => {
  it("renders platform console title", async () => {
    render(<AdminDashboard />);
    const titles = await screen.findAllByText("Platform Console");
    expect(titles.length).toBeGreaterThan(0);
  });

  it("links dashboard metric cards to admin lists", async () => {
    render(<AdminDashboard />);
    const usersCard = await screen.findByTestId("admin-stat-users");
    const membersCard = await screen.findByTestId("admin-stat-members");
    const ownersCard = await screen.findByTestId("admin-stat-owner-companies");
    const listingsCard = await screen.findByTestId("admin-stat-live-listings");

    expect(usersCard).toHaveAttribute("href", "/admin/users");
    expect(membersCard).toHaveAttribute("href", "/admin/members");
    expect(ownersCard).toHaveAttribute("href", "/admin/owner-companies");
    expect(listingsCard).toHaveAttribute("href", "/admin/listings");
    expect(screen.getByTestId("mobile-menu-button")).toBeInTheDocument();
  });
});
