import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import OwnerMembersPage from "../app/owner/members/page";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

function member(overrides: Record<string, unknown> = {}) {
  return {
    user_public_id: "member_1",
    organization_public_id: "org_1",
    name: "Alice Member",
    email: "alice@example.com",
    status: "active",
    phone: null,
    company_name: null,
    tags: [],
    notes_preview: null,
    materialized: false,
    stats: {
      total_bookings: 1,
      confirmed_bookings: 1,
      canceled_bookings: 0,
      no_shows: 0,
      open_requests: 0,
      total_revenue_cents: 4900,
      active_subscriptions: 0,
      first_booking_at: null,
      last_booking_at: null,
    },
    ...overrides,
  };
}

describe("OwnerMembersPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string) => {
      if (url === "/api/orgs") {
        return Promise.resolve([
          { public_id: "org_1", name: "Downtown Cowork" },
          { public_id: "org_2", name: "Uptown Cowork" },
        ]);
      }
      if (url === "/api/owner/members?organization_public_id=org_1") {
        return Promise.resolve([member()]);
      }
      if (url === "/api/owner/members?organization_public_id=org_2") {
        return Promise.resolve([
          member({
            user_public_id: "member_2",
            organization_public_id: "org_2",
            name: "Bob Member",
            email: "bob@example.com",
          }),
        ]);
      }
      return Promise.reject(new Error(`Unhandled url: ${url}`));
    });
  });

  it("loads members with the selected organization id and preserves it in detail links", async () => {
    render(<OwnerMembersPage />);

    expect(await screen.findByText("Alice Member")).toBeInTheDocument();
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/owner/members?organization_public_id=org_1",
        { method: "GET" },
        "token",
      ),
    );
    expect(screen.getByRole("link", { name: "Alice Member" })).toHaveAttribute(
      "href",
      "/owner/members/member_1?organization_public_id=org_1",
    );

    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "org_2" } });

    expect(await screen.findByText("Bob Member")).toBeInTheDocument();
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/owner/members?organization_public_id=org_2",
        { method: "GET" },
        "token",
      ),
    );
    expect(screen.getByRole("link", { name: "Bob Member" })).toHaveAttribute(
      "href",
      "/owner/members/member_2?organization_public_id=org_2",
    );
  });
});
