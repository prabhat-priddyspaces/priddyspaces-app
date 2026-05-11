import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import OwnerMarketingHome from "../app/owner/marketing/page";

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
  clearAccessToken: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn((url: string) => {
    if (url === "/api/me") {
      return Promise.resolve({
        public_id: "owner_1",
        email: "owner@example.com",
        first_name: "Owner",
        last_name: "User",
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
      });
    }
    if (url === "/api/orgs") {
      return Promise.resolve([{ public_id: "org_1", name: "Downtown Cowork" }]);
    }
    if (url.startsWith("/api/marketing/templates")) return Promise.resolve([{ public_id: "tpl_1" }]);
    if (url.startsWith("/api/marketing/segments")) return Promise.resolve([{ public_id: "seg_1" }]);
    if (url.startsWith("/api/marketing/campaigns")) return Promise.resolve([{ public_id: "camp_1" }]);
    if (url.startsWith("/api/marketing/workflows")) return Promise.resolve([{ public_id: "flow_1" }]);
    if (url.startsWith("/api/marketing/suppressions")) return Promise.resolve([{ public_id: "sup_1", status: "active" }]);
    if (url.startsWith("/api/marketing/settings")) {
      return Promise.resolve({
        organization_public_id: "org_1",
        default_sender_lane: "shared",
        allowed_lanes: ["shared", "verified_sender"],
        shared_daily_cap: 500,
        verified_sender_daily_cap: 2000,
        shared_from_email: "marketing@priddyspaces.com",
        shared_from_name: "Priddyspaces",
        verified_sender_public_id: null,
        verified_senders: [],
      });
    }
    return Promise.resolve([]);
  }),
}));

describe("OwnerMarketingHome", () => {
  it("renders marketing cards and summary metrics", async () => {
    render(<OwnerMarketingHome />);

    expect(await screen.findByRole("heading", { name: "Marketing" })).toBeInTheDocument();
    expect(screen.getAllByText("Templates").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Campaigns").length).toBeGreaterThan(0);
    expect(screen.getByText("Sender Settings")).toBeInTheDocument();
    expect(await screen.findByText("Sender Lane")).toBeInTheDocument();
  });
});
