import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerMarketingCampaignDetailScreen } from "../src/screens/owner/OwnerMarketingCampaignDetailScreen";
import { apiFetch } from "../src/lib/api";

let mockRouteParams: Record<string, unknown> = {};

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const campaign = {
  public_id: "camp_1",
  name: "June newsletter",
  status: "draft",
  sender_lane: "shared",
  eligible_count: 120,
  sent_count: 0,
  opened_count: 0,
  clicked_count: 0,
};

function mockApi(status = "draft") {
  (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method || "GET";
    if (path === "/api/marketing/campaigns/camp_1" && method === "GET") {
      return Promise.resolve({ ...campaign, status });
    }
    if (path === "/api/marketing/campaigns/camp_1/review-breakdown") {
      return Promise.resolve({ total: 130, eligible: 120, suppressed: 8, no_email: 2 });
    }
    if (path === "/api/marketing/campaigns/camp_1/recipients") {
      return Promise.resolve([
        {
          public_id: "rcpt_1",
          email: "customer@test.com",
          status: "suppressed",
          suppression_reason: "unsubscribed",
          provider_message_id: null,
          created_at: "2026-06-10T00:00:00Z",
        },
      ]);
    }
    if (path === "/api/marketing/campaigns/camp_1/send" && method === "POST") return Promise.resolve({});
    if (path === "/api/marketing/campaigns/camp_1/cancel" && method === "POST") return Promise.resolve({});
    return Promise.resolve([]);
  });
}

describe("OwnerMarketingCampaignDetailScreen", () => {
  beforeEach(() => {
    mockRouteParams = { publicId: "camp_1", orgId: "org_1" };
    (apiFetch as jest.Mock).mockReset();
  });

  it("shows stats, review, and recipients with suppression reasons", async () => {
    mockApi();
    const { getByText } = render(<OwnerMarketingCampaignDetailScreen />);

    await waitFor(() => expect(getByText("June newsletter")).toBeTruthy());
    expect(getByText("Review: total 130, eligible 120, suppressed 8, no email 2")).toBeTruthy();
    expect(getByText("customer@test.com")).toBeTruthy();
    expect(getByText("suppressed • unsubscribed")).toBeTruthy();
  });

  it("sends a draft and cancels a scheduled campaign per web's gating", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerMarketingCampaignDetailScreen />);

    await waitFor(() => expect(getByLabelText("Send now")).toBeTruthy());
    fireEvent.press(getByLabelText("Send now"));
    await waitFor(() => expect(getByText("Campaign sent")).toBeTruthy());
    expect(
      (apiFetch as jest.Mock).mock.calls.some(
        ([path, options]) => path === "/api/marketing/campaigns/camp_1/send" && options?.method === "POST",
      ),
    ).toBe(true);

    fireEvent.press(getByLabelText("Cancel campaign"));
    await waitFor(() => expect(getByText("Campaign canceled")).toBeTruthy());
  });

  it("disables actions for sent campaigns", async () => {
    mockApi("sent");
    const { getByLabelText } = render(<OwnerMarketingCampaignDetailScreen />);

    await waitFor(() => expect(getByLabelText("Send now")).toBeTruthy());
    fireEvent.press(getByLabelText("Send now"));
    fireEvent.press(getByLabelText("Cancel campaign"));
    expect(
      (apiFetch as jest.Mock).mock.calls.filter(([, options]) => options?.method === "POST").length,
    ).toBe(0);
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation(() => Promise.reject(new Error("Failed to load campaign")));

    const { getByText } = render(<OwnerMarketingCampaignDetailScreen />);

    await waitFor(() => expect(getByText("Failed to load campaign")).toBeTruthy());
  });
});
