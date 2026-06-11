import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerMarketingSegmentsScreen } from "../src/screens/owner/OwnerMarketingSegmentsScreen";
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

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method || "GET";
    if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
    if (path.startsWith("/api/marketing/segments?")) {
      return Promise.resolve([{ public_id: "seg_1", name: "VIPs", description: "Top spenders" }]);
    }
    if (path === "/api/marketing/segments/preview-count" && method === "POST") {
      return Promise.resolve({ total: 37, sample: [] });
    }
    if (path === "/api/marketing/segments" && method === "POST") return Promise.resolve({});
    return Promise.resolve([]);
  });
}

describe("OwnerMarketingSegmentsScreen", () => {
  beforeEach(() => {
    mockRouteParams = { orgId: "org_1" };
    (apiFetch as jest.Mock).mockReset();
  });

  it("builds web's filters object for preview and save", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerMarketingSegmentsScreen />);

    await waitFor(() => expect(getByText("VIPs")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Name"), "Big spenders");
    fireEvent.press(getByLabelText("Filter status active"));
    fireEvent.changeText(getByLabelText("Tags (comma separated)"), "vip, monthly");
    fireEvent.press(getByLabelText("Tag mode all"));
    fireEvent.press(getByLabelText("Subscription Has subscription"));
    fireEvent.changeText(getByLabelText("Min booking count"), "5");
    fireEvent.changeText(getByLabelText("Min lifetime revenue (cents)"), "100000");
    fireEvent.changeText(getByLabelText("Last booking after (YYYY-MM-DD)"), "2026-01-01");

    fireEvent.press(getByLabelText("Preview count"));
    await waitFor(() => expect(getByText("Matches 37 members.")).toBeTruthy());
    const previewCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/marketing/segments/preview-count" && options?.method === "POST",
    );
    expect(JSON.parse(previewCall[1].body)).toEqual({
      organization_public_id: "org_1",
      filters: {
        status: "active",
        tags: ["vip", "monthly"],
        tag_mode: "all",
        active_subscription: true,
        min_booking_count: 5,
        min_lifetime_revenue_cents: 100000,
        last_booking_after: "2026-01-01",
      },
    });

    fireEvent.press(getByLabelText("Save segment"));
    await waitFor(() => expect(getByText("Segment saved")).toBeTruthy());
    const saveCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/marketing/segments" && options?.method === "POST",
    );
    expect(JSON.parse(saveCall[1].body)).toMatchObject({
      organization_public_id: "org_1",
      name: "Big spenders",
    });
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
      return Promise.reject(new Error("Failed to load segments"));
    });

    const { getByText } = render(<OwnerMarketingSegmentsScreen />);

    await waitFor(() => expect(getByText("Failed to load segments")).toBeTruthy());
  });
});
