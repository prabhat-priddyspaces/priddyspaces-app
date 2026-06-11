import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerMarketingSuppressionsScreen } from "../src/screens/owner/OwnerMarketingSuppressionsScreen";
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

const suppression = {
  public_id: "sup_1",
  email: "customer@test.com",
  reason: "unsubscribed",
  status: "active",
  created_at: "2026-06-01T00:00:00Z",
};

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method || "GET";
    if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
    if (path.startsWith("/api/marketing/suppressions?")) return Promise.resolve([suppression]);
    if (path === "/api/marketing/suppressions" && method === "POST") return Promise.resolve({});
    if (path === "/api/marketing/suppressions/sup_1/resubscribe" && method === "POST") {
      return Promise.resolve({});
    }
    return Promise.resolve([]);
  });
}

describe("OwnerMarketingSuppressionsScreen", () => {
  beforeEach(() => {
    mockRouteParams = { orgId: "org_1" };
    (apiFetch as jest.Mock).mockReset();
  });

  it("adds a manual suppression with web's payload", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerMarketingSuppressionsScreen />);

    await waitFor(() => expect(getByText("customer@test.com")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Suppression email"), "spam@test.com");
    fireEvent.press(getByLabelText("Reason spam_report"));
    fireEvent.press(getByLabelText("Add suppression"));

    await waitFor(() => expect(getByText("Suppression added")).toBeTruthy());
    const postCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/marketing/suppressions" && options?.method === "POST",
    );
    expect(JSON.parse(postCall[1].body)).toEqual({
      organization_public_id: "org_1",
      email: "spam@test.com",
      reason: "spam_report",
    });
  });

  it("resubscribes an active suppression", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerMarketingSuppressionsScreen />);

    await waitFor(() => expect(getByLabelText("Resubscribe sup_1")).toBeTruthy());
    fireEvent.press(getByLabelText("Resubscribe sup_1"));

    await waitFor(() => expect(getByText("Recipient resubscribed")).toBeTruthy());
    expect(
      (apiFetch as jest.Mock).mock.calls.some(
        ([path, options]) =>
          path === "/api/marketing/suppressions/sup_1/resubscribe" && options?.method === "POST",
      ),
    ).toBe(true);
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
      return Promise.reject(new Error("Failed to load suppressions"));
    });

    const { getByText } = render(<OwnerMarketingSuppressionsScreen />);

    await waitFor(() => expect(getByText("Failed to load suppressions")).toBeTruthy());
  });
});
