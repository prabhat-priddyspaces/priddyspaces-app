import React from "react";
import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import MemberRewardsPage from "../app/member/rewards/page";
import OwnerLoyaltyPage from "../app/owner/loyalty/page";

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
  getActiveImpersonationToken: vi.fn(() => null),
  clearAccessToken: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/owner/loyalty",
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
    if (url.startsWith("/api/loyalty/settings")) {
      return Promise.resolve({
        public_id: "settings_1",
        organization_public_id: "org_1",
        is_enabled: true,
        accepts_priddy_points: true,
        owner_points_redemption_enabled: true,
        platform_priddy_points_enabled: true,
        platform_priddy_allowed_space_types: ["shared_desk"],
        platform_priddy_allowed_booking_modes: ["day_pass"],
        point_value_cents: 1,
        earn_rate_bps: 100,
        earn_points_per_dollar: 1,
        earn_points_per_100_dollars: 100,
        max_redemption_percent: 25,
        allowed_space_types: ["conference_room", "shared_desk"],
        allowed_booking_modes: ["hourly", "day_pass"],
        promo_expiration_days: 180,
        earned_expiration_days: 730,
        campaign_daily_issue_cap: 500000,
        max_promo_grant_points: 100000,
        updated_at: null,
      });
    }
    if (url.startsWith("/api/loyalty/owner/summary")) {
      return Promise.resolve({
        organization_public_id: "org_1",
        points_issued: 1000,
        points_redeemed: 250,
        outstanding_points: 750,
        outstanding_liability_cents: 750,
        redemption_rate_percent: 25,
        repeat_member_rate_percent: 40,
        active_wallets: 3,
        campaigns: 1,
        top_members: [{ user_public_id: "user_1", name: "Jane", email: "jane@example.com", points: 750, tier: "Silver" }],
      });
    }
    if (url.startsWith("/api/loyalty/campaigns")) {
      return Promise.resolve([
        {
          public_id: "campaign_1",
          organization_public_id: "org_1",
          name: "First booking",
          campaign_type: "first_booking_bonus",
          status: "active",
          rules_json: {},
          reward_json: { point_type: "promo", points: 500 },
          budget_points: 5000,
          issued_points: 500,
          starts_at: null,
          ends_at: null,
          created_at: null,
          updated_at: null,
        },
      ]);
    }
    if (url === "/api/loyalty/wallets") {
      return Promise.resolve([
        {
          public_id: "wallet_1",
          organization_public_id: "org_1",
          organization_name: "Downtown Cowork",
          promo_balance: 200,
          earned_balance: 500,
          total_balance: 700,
          lifetime_earned_points: 12000,
          tier: "Silver",
          point_value_cents: 1,
          cash_value_cents: 700,
          next_expiration_at: null,
          expiring_points: 0,
        },
      ]);
    }
    if (url === "/api/loyalty/priddy-wallet") {
      return Promise.resolve({
        public_id: "priddy_1",
        balance: 1000,
        lifetime_earned_points: 1000,
        point_value_cents: 1,
        cash_value_cents: 1000,
      });
    }
    if (url === "/api/loyalty/priddy-wallet/transactions") {
      return Promise.resolve([
        {
          public_id: "priddy_entry_1",
          entry_type: "signup_grant",
          point_type: "priddy",
          points: 1000,
          source: "signup",
          source_public_id: "user_1",
          expires_at: null,
          note: "Signup Priddy Points",
          created_at: null,
        },
      ]);
    }
    if (url.startsWith("/api/loyalty/wallets/org_1/transactions")) {
      return Promise.resolve([
        {
          public_id: "entry_1",
          entry_type: "earned_grant",
          point_type: "earned",
          points: 500,
          source: "payment",
          source_public_id: "pay_1",
          expires_at: null,
          note: "Earned from paid booking",
          created_at: null,
        },
      ]);
    }
    return Promise.resolve([]);
  }),
}));

describe("loyalty UI", () => {
  it("renders owner loyalty dashboard controls", async () => {
    render(<OwnerLoyaltyPage />);

    expect(await screen.findByRole("heading", { name: "Loyalty" })).toBeInTheDocument();
    expect(await screen.findByText("Outstanding liability")).toBeInTheDocument();
    expect(screen.getByText("Reward settings")).toBeInTheDocument();
    expect(screen.getByText("Campaign builder")).toBeInTheDocument();
    expect(screen.getByText("First booking")).toBeInTheDocument();
  });

  it("labels workspace rewards and filters Priddy eligibility by platform settings", async () => {
    render(<OwnerLoyaltyPage />);

    expect(await screen.findByText("Enable workspace rewards")).toBeInTheDocument();
    expect(screen.getByText("Members can redeem points earned with this organization on eligible bookings.")).toBeInTheDocument();
    expect(screen.getByText("Members can redeem platform points on eligible bookings allowed by Priddyspaces.")).toBeInTheDocument();

    const priddySpaceGroup = screen.getByText("Priddy Points space types").parentElement as HTMLElement;
    expect(within(priddySpaceGroup).getByText("Shared desk")).toBeInTheDocument();
    expect(within(priddySpaceGroup).queryByText("Conference room")).not.toBeInTheDocument();

    const priddyBookingGroup = screen.getByText("Priddy Points booking types").parentElement as HTMLElement;
    expect(within(priddyBookingGroup).getByText("Day pass")).toBeInTheDocument();
    expect(within(priddyBookingGroup).queryByText("Hourly")).not.toBeInTheDocument();

    const workspaceSpaceGroup = screen.getByText("Workspace rewards space types").parentElement as HTMLElement;
    expect(within(workspaceSpaceGroup).getByText("Conference room")).toBeInTheDocument();
  });

  it("renders member rewards wallet and history", async () => {
    render(<MemberRewardsPage />);

    expect(await screen.findByRole("heading", { name: "Rewards" })).toBeInTheDocument();
    expect(await screen.findByText("Downtown Cowork")).toBeInTheDocument();
    expect(screen.getByText("Available points")).toBeInTheDocument();
    expect(screen.getByText("Rewards history")).toBeInTheDocument();
    expect(await screen.findByText("earned grant")).toBeInTheDocument();
  });
});
