import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerLoyaltyScreen } from "../src/screens/owner/OwnerLoyaltyScreen";
import { apiFetch } from "../src/lib/api";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const settings = {
  is_enabled: true,
  accepts_priddy_points: false,
  owner_points_redemption_enabled: true,
  point_value_cents: 1,
  earn_points_per_100_dollars: 500,
  max_redemption_percent: 50,
  allowed_space_types: ["shared_desk"],
  allowed_booking_modes: ["day_pass"],
  promo_expiration_days: 90,
  earned_expiration_days: 365,
  campaign_daily_issue_cap: 10000,
  max_promo_grant_points: 5000,
};

const summary = {
  points_issued: 12000,
  points_redeemed: 4000,
  outstanding_points: 8000,
  outstanding_liability_cents: 8000,
};

const campaign = {
  public_id: "camp_1",
  name: "Welcome bonus",
  campaign_type: "signup_bonus",
  status: "active",
  budget_points: 10000,
  issued_points: 2500,
};

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method || "GET";
    if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
    if (path.startsWith("/api/loyalty/settings?") && method === "GET") return Promise.resolve(settings);
    if (path.startsWith("/api/loyalty/settings?") && method === "PUT") return Promise.resolve(settings);
    if (path.startsWith("/api/loyalty/owner/summary?")) return Promise.resolve(summary);
    if (path.startsWith("/api/loyalty/campaigns?")) return Promise.resolve([campaign]);
    if (path === "/api/loyalty/campaigns" && method === "POST") return Promise.resolve({});
    if (path === "/api/loyalty/campaigns/camp_1" && method === "PATCH") return Promise.resolve({});
    if (path === "/api/loyalty/manual-adjustments" && method === "POST") return Promise.resolve({});
    return Promise.resolve({});
  });
}

describe("OwnerLoyaltyScreen", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it("saves settings with web's exact projection", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerLoyaltyScreen />);

    await waitFor(() => expect(getByText("Welcome bonus")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Max redemption %"), "75");
    fireEvent.press(getByLabelText("Allow Suite"));
    fireEvent.press(getByLabelText("Save loyalty settings"));

    await waitFor(() => expect(getByText("Loyalty settings saved")).toBeTruthy());
    const putCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => String(path).startsWith("/api/loyalty/settings?") && options?.method === "PUT",
    );
    const body = JSON.parse(putCall[1].body);
    expect(body.max_redemption_percent).toBe(75);
    expect(body.allowed_space_types).toEqual(["shared_desk", "suite"]);
    expect(Object.keys(body).sort()).toEqual(
      [
        "is_enabled",
        "accepts_priddy_points",
        "owner_points_redemption_enabled",
        "point_value_cents",
        "earn_points_per_100_dollars",
        "max_redemption_percent",
        "allowed_space_types",
        "allowed_booking_modes",
        "promo_expiration_days",
        "earned_expiration_days",
        "campaign_daily_issue_cap",
        "max_promo_grant_points",
      ].sort(),
    );
  });

  it("creates a campaign and toggles status", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerLoyaltyScreen />);

    await waitFor(() => expect(getByText("Welcome bonus")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Campaign name"), "Happy hour 2x");
    fireEvent.press(getByLabelText("Campaign type Happy hour"));
    fireEvent.changeText(getByLabelText("Campaign points"), "200");
    fireEvent.press(getByLabelText("Create campaign"));

    await waitFor(() => expect(getByText("Campaign saved")).toBeTruthy());
    const postCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/loyalty/campaigns" && options?.method === "POST",
    );
    expect(JSON.parse(postCall[1].body)).toEqual({
      organization_public_id: "org_1",
      name: "Happy hour 2x",
      campaign_type: "happy_hour",
      status: "draft",
      reward_json: { point_type: "promo", points: 200 },
      rules_json: {},
      budget_points: null,
    });

    fireEvent.press(getByLabelText("Pause camp_1"));
    await waitFor(() =>
      expect(
        (apiFetch as jest.Mock).mock.calls.some(
          ([path, options]) => path === "/api/loyalty/campaigns/camp_1" && options?.method === "PATCH",
        ),
      ).toBe(true),
    );
  });

  it("grants manual points", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerLoyaltyScreen />);

    await waitFor(() => expect(getByText("Manual grant")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Member user ID"), "user_1");
    fireEvent.press(getByLabelText("Grant earned points"));
    fireEvent.changeText(getByLabelText("Grant points"), "250");
    fireEvent.changeText(getByLabelText("Grant note"), "Service recovery");
    fireEvent.press(getByLabelText("Submit manual grant"));

    await waitFor(() => expect(getByText("Manual points granted")).toBeTruthy());
    const grantCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/loyalty/manual-adjustments" && options?.method === "POST",
    );
    expect(JSON.parse(grantCall[1].body)).toEqual({
      organization_public_id: "org_1",
      user_public_id: "user_1",
      point_type: "earned",
      points: 250,
      note: "Service recovery",
    });
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
      return Promise.reject(new Error("Failed to load loyalty"));
    });

    const { getByText } = render(<OwnerLoyaltyScreen />);

    await waitFor(() => expect(getByText("Failed to load loyalty")).toBeTruthy());
  });
});
