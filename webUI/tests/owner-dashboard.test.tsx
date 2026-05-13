import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import OwnerDashboard from "../app/owner/page";

const nowIso = new Date().toISOString();

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn((url: string) => {
    if (url.startsWith("/api/booking-requests")) {
      return Promise.resolve([{ status: "requested", estimated_amount: 100 }]);
    }
    if (url.startsWith("/api/payments")) {
      return Promise.resolve([{ amount: 200, status: "succeeded", created_at: nowIso }]);
    }
    if (url.startsWith("/api/invoices")) {
      return Promise.resolve([{ amount: 200, created_at: nowIso }]);
    }
    if (url.startsWith("/api/orgs/") && url.endsWith("/members")) {
      return Promise.resolve([{ public_id: "m1" }]);
    }
    if (url.startsWith("/api/locations?organization_public_id=")) {
      return Promise.resolve([{ public_id: "loc_1", name: "Downtown", city: "Austin" }]);
    }
    if (url.startsWith("/api/locations/loc_1/spaces")) {
      return Promise.resolve([
        { public_id: "space_1", availability_status: "available" },
        { public_id: "space_2", availability_status: "reserved" },
      ]);
    }
    if (url.startsWith("/api/subscriptions")) {
      return Promise.resolve([{ status: "active" }]);
    }
    if (url.startsWith("/api/orgs")) {
      return Promise.resolve([{ public_id: "org_1", name: "Org" }]);
    }
    return Promise.resolve([]);
  })
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
  getActiveImpersonationToken: vi.fn(() => null)
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/owner",
}));

describe("OwnerDashboard", () => {
  it("renders stats", async () => {
    render(<OwnerDashboard />);
    expect(await screen.findByText("MTD Revenue")).toBeInTheDocument();
    expect(screen.getByText("Active members")).toBeInTheDocument();
    expect(screen.getByText("Downtown")).toBeInTheDocument();
    expect(screen.getByText("Occupancy")).toBeInTheDocument();
  });
});
