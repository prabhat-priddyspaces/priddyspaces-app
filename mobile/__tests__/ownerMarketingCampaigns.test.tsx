import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerMarketingCampaignsScreen } from "../src/screens/owner/OwnerMarketingCampaignsScreen";
import { apiFetch } from "../src/lib/api";

const mockNavigate = jest.fn();
let mockRouteParams: Record<string, unknown> = {};

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
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
  scheduled_at: null,
};

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method || "GET";
    if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
    if (path.startsWith("/api/marketing/templates?")) {
      return Promise.resolve([{ public_id: "tpl_1", name: "Newsletter" }]);
    }
    if (path.startsWith("/api/marketing/segments?")) {
      return Promise.resolve([{ public_id: "seg_1", name: "Active members" }]);
    }
    if (path.startsWith("/api/marketing/campaigns?")) return Promise.resolve([campaign]);
    if (path === "/api/marketing/campaigns" && method === "POST") return Promise.resolve(campaign);
    if (path === "/api/marketing/campaigns/camp_1/review-breakdown") {
      return Promise.resolve({ total: 130, eligible: 120, suppressed: 8, no_email: 2 });
    }
    if (path === "/api/marketing/campaigns/camp_1/send" && method === "POST") return Promise.resolve({});
    return Promise.resolve([]);
  });
}

describe("OwnerMarketingCampaignsScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockRouteParams = {};
    (apiFetch as jest.Mock).mockReset();
  });

  it("creates a draft with web's payload", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerMarketingCampaignsScreen />);

    await waitFor(() => expect(getByText("June newsletter")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Campaign name"), "July promo");
    fireEvent.press(getByLabelText("Segment Active members"));
    fireEvent.press(getByLabelText("Sender verified"));
    fireEvent.press(getByLabelText("Create draft"));

    await waitFor(() => expect(getByText("Campaign draft created")).toBeTruthy());
    const postCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/marketing/campaigns" && options?.method === "POST",
    );
    expect(JSON.parse(postCall[1].body)).toEqual({
      organization_public_id: "org_1",
      name: "July promo",
      template_public_id: "tpl_1",
      segment_public_id: "seg_1",
      sender_lane: "verified_sender",
      scheduled_at: null,
    });
  });

  it("reviews and sends a draft campaign", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerMarketingCampaignsScreen />);

    await waitFor(() => expect(getByLabelText("Review camp_1")).toBeTruthy());
    fireEvent.press(getByLabelText("Review camp_1"));

    await waitFor(() =>
      expect(getByText("Total 130 • Eligible 120 • Suppressed 8 • No email 2")).toBeTruthy(),
    );
    fireEvent.press(getByLabelText("Send now"));

    await waitFor(() => expect(getByText("Campaign sent")).toBeTruthy());
    const sendCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/marketing/campaigns/camp_1/send" && options?.method === "POST",
    );
    expect(JSON.parse(sendCall[1].body)).toEqual({ scheduled_at: null });
  });

  it("opens the campaign detail screen", async () => {
    mockApi();
    const { getByLabelText } = render(<OwnerMarketingCampaignsScreen />);

    await waitFor(() => expect(getByLabelText("Open campaign June newsletter")).toBeTruthy());
    fireEvent.press(getByLabelText("Open campaign June newsletter"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerMarketingCampaignDetail", {
      publicId: "camp_1",
      orgId: "org_1",
    });
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
      return Promise.reject(new Error("Failed to load campaigns"));
    });

    const { getByText } = render(<OwnerMarketingCampaignsScreen />);

    await waitFor(() => expect(getByText("Failed to load campaigns")).toBeTruthy());
  });
});
