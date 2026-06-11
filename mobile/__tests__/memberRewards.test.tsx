import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { MemberRewardsScreen } from "../src/screens/member/MemberRewardsScreen";
import { apiFetch } from "../src/lib/api";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const priddyWallet = {
  public_id: "pw_1",
  balance: 1250,
  lifetime_earned_points: 4000,
  point_value_cents: 1,
  cash_value_cents: 1250,
};

const wallets = [
  {
    public_id: "w_1",
    organization_public_id: "org_1",
    organization_name: "Priddyspaces Rochester",
    promo_balance: 500,
    earned_balance: 1500,
    total_balance: 2000,
    lifetime_earned_points: 12000,
    tier: "silver",
    point_value_cents: 1,
    cash_value_cents: 2000,
    next_expiration_at: "2026-09-01T00:00:00Z",
    expiring_points: 250,
  },
  {
    public_id: "w_2",
    organization_public_id: "org_2",
    organization_name: "Buffalo Cowork",
    promo_balance: 0,
    earned_balance: 100,
    total_balance: 100,
    lifetime_earned_points: 100,
    tier: "member",
    point_value_cents: 1,
    cash_value_cents: 100,
    next_expiration_at: null,
    expiring_points: 0,
  },
];

const orgTransactions = [
  {
    public_id: "tx_1",
    entry_type: "booking_earn",
    point_type: "earned",
    points: 150,
    source: "booking",
    expires_at: "2026-12-01T00:00:00Z",
    note: "Day pass at Rochester Hub",
  },
  {
    public_id: "tx_2",
    entry_type: "redemption",
    point_type: "earned",
    points: -50,
    source: "booking",
    expires_at: null,
    note: null,
  },
];

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string) => {
    if (path === "/api/loyalty/priddy-wallet") return Promise.resolve(priddyWallet);
    if (path === "/api/loyalty/wallets") return Promise.resolve(wallets);
    if (path === "/api/loyalty/priddy-wallet/transactions") {
      return Promise.resolve([
        {
          public_id: "ptx_1",
          entry_type: "platform_grant",
          point_type: "promo",
          points: 1250,
          source: "platform",
          expires_at: null,
          note: null,
        },
      ]);
    }
    if (path === "/api/loyalty/wallets/org_1/transactions") return Promise.resolve(orgTransactions);
    if (path === "/api/loyalty/wallets/org_2/transactions") return Promise.resolve([]);
    return Promise.resolve([]);
  });
}

describe("MemberRewardsScreen", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it("shows priddy points, wallet metrics, and the rewards ledger", async () => {
    mockApi();
    const { getByText } = render(<MemberRewardsScreen />);

    await waitFor(() => expect(getByText("Priddy Points")).toBeTruthy());
    expect(getByText("1,250")).toBeTruthy();
    expect(getByText("2,000")).toBeTruthy();
    expect(getByText("$20")).toBeTruthy();
    expect(getByText("silver")).toBeTruthy();
    expect(getByText("250 pts")).toBeTruthy();
    await waitFor(() => expect(getByText("Day pass at Rochester Hub")).toBeTruthy());
    expect(getByText("+150")).toBeTruthy();
    expect(getByText("-50")).toBeTruthy();
  });

  it("switches wallets per organization", async () => {
    mockApi();
    const { getByLabelText, getByText, queryByText } = render(<MemberRewardsScreen />);

    await waitFor(() => expect(getByLabelText("Wallet Buffalo Cowork")).toBeTruthy());
    fireEvent.press(getByLabelText("Wallet Buffalo Cowork"));

    await waitFor(() => expect(getByText("No rewards activity yet.")).toBeTruthy());
    expect(queryByText("Day pass at Rochester Hub")).toBeNull();
    expect(
      (apiFetch as jest.Mock).mock.calls.some(([path]) => path === "/api/loyalty/wallets/org_2/transactions"),
    ).toBe(true);
  });

  it("shows the earn-prompt empty state when there are no wallets", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/loyalty/priddy-wallet") return Promise.resolve(priddyWallet);
      if (path === "/api/loyalty/wallets") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const { getByText } = render(<MemberRewardsScreen />);

    await waitFor(() =>
      expect(getByText("Book an eligible space to start earning owner-specific rewards.")).toBeTruthy(),
    );
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation(() => Promise.reject(new Error("Failed to load rewards")));

    const { getByText } = render(<MemberRewardsScreen />);

    await waitFor(() => expect(getByText("Failed to load rewards")).toBeTruthy());
  });
});
