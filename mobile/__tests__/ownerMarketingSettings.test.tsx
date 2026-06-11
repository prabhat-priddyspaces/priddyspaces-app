import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerMarketingSettingsScreen } from "../src/screens/owner/OwnerMarketingSettingsScreen";
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

const settings = {
  default_sender_lane: "shared",
  allowed_lanes: ["shared", "verified_sender"],
  shared_daily_cap: 500,
  verified_sender_daily_cap: 2000,
  shared_from_email: "mail@priddyspaces.com",
  shared_from_name: "Priddyspaces",
  verified_sender_public_id: null,
  verified_senders: [
    { public_id: "vs_1", email: "hello@acme.com", name: "Acme", status: "pending" },
  ],
};

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method || "GET";
    if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
    if (path.startsWith("/api/marketing/settings?")) return Promise.resolve(settings);
    if (path === "/api/marketing/settings/sender" && method === "PUT") return Promise.resolve({});
    if (path === "/api/marketing/settings/verified-senders" && method === "POST") return Promise.resolve({});
    if (path === "/api/marketing/settings/verified-senders/vs_1/refresh" && method === "POST") {
      return Promise.resolve({});
    }
    return Promise.resolve([]);
  });
}

describe("OwnerMarketingSettingsScreen", () => {
  beforeEach(() => {
    mockRouteParams = { orgId: "org_1" };
    (apiFetch as jest.Mock).mockReset();
  });

  it("saves the sender lane selection with web's payload", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerMarketingSettingsScreen />);

    await waitFor(() => expect(getByLabelText("Lane verified_sender")).toBeTruthy());
    fireEvent.press(getByLabelText("Lane verified_sender"));
    fireEvent.press(getByLabelText("Verified sender hello@acme.com"));
    fireEvent.press(getByLabelText("Save sender settings"));

    await waitFor(() => expect(getByText("Sender settings saved")).toBeTruthy());
    const putCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/marketing/settings/sender" && options?.method === "PUT",
    );
    expect(JSON.parse(putCall[1].body)).toEqual({
      organization_public_id: "org_1",
      default_sender_lane: "verified_sender",
      verified_sender_public_id: "vs_1",
    });
  });

  it("requests a verified sender and refreshes status", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerMarketingSettingsScreen />);

    await waitFor(() => expect(getByLabelText("Verified sender email")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Verified sender email"), "founder@acme.com");
    fireEvent.changeText(getByLabelText("Verified sender name"), "Acme Founder");
    fireEvent.press(getByLabelText("Request verified sender"));

    await waitFor(() => expect(getByText("Verified sender requested")).toBeTruthy());
    const postCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) =>
        path === "/api/marketing/settings/verified-senders" && options?.method === "POST",
    );
    expect(JSON.parse(postCall[1].body)).toEqual({
      organization_public_id: "org_1",
      email: "founder@acme.com",
      name: "Acme Founder",
    });

    fireEvent.press(getByLabelText("Refresh vs_1"));
    await waitFor(() => expect(getByText("Sender refreshed")).toBeTruthy());
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
      return Promise.reject(new Error("Failed to load settings"));
    });

    const { getByText } = render(<OwnerMarketingSettingsScreen />);

    await waitFor(() => expect(getByText("Failed to load settings")).toBeTruthy());
  });
});
