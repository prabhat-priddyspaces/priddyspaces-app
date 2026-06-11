import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerAssistantPoliciesScreen } from "../src/screens/owner/OwnerAssistantPoliciesScreen";
import { apiFetch } from "../src/lib/api";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const existingPolicy = {
  public_id: "policy_1",
  scope_type: "organization",
  category: "wifi",
  title: "Guest wifi",
  body: "Network: Priddy-Guest, password at front desk.",
  source_url: null,
  is_active: true,
};

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method || "GET";
    if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
    if (path.startsWith("/api/locations?")) return Promise.resolve([{ public_id: "loc_1", name: "Hub" }]);
    if (path === "/api/locations/loc_1/spaces") {
      return Promise.resolve([{ public_id: "space_1", name: "Board Room", space_type: "conference_room" }]);
    }
    if (path === "/api/assistant/policies" && method === "GET") return Promise.resolve([existingPolicy]);
    if (path === "/api/assistant/policies" && method === "POST") {
      return Promise.resolve({ ...existingPolicy, public_id: "policy_2", title: "Parking", category: "parking" });
    }
    if (path === "/api/assistant/policies/policy_1" && method === "DELETE") return Promise.resolve({});
    return Promise.resolve([]);
  });
}

describe("OwnerAssistantPoliciesScreen", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it("creates a policy with web's payload shape", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerAssistantPoliciesScreen />);

    await waitFor(() => expect(getByText("Guest wifi")).toBeTruthy());
    fireEvent.press(getByLabelText("Scope space"));
    fireEvent.press(getByLabelText("Category parking"));
    fireEvent.changeText(getByLabelText("Policy title"), "Parking");
    fireEvent.changeText(getByLabelText("Policy text"), "Lot B behind the building.");
    fireEvent.press(getByLabelText("Save policy"));

    await waitFor(() => expect(getByText("Policy saved.")).toBeTruthy());
    const postCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/assistant/policies" && options?.method === "POST",
    );
    expect(JSON.parse(postCall[1].body)).toEqual({
      scope_type: "space",
      scope_public_id: "space_1",
      category: "parking",
      title: "Parking",
      body: "Lot B behind the building.",
      source_url: null,
    });
  });

  it("requires title and body before saving", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerAssistantPoliciesScreen />);

    await waitFor(() => expect(getByText("Guest wifi")).toBeTruthy());
    fireEvent.press(getByLabelText("Save policy"));

    await waitFor(() => expect(getByText("Title and policy text are required.")).toBeTruthy());
    expect(
      (apiFetch as jest.Mock).mock.calls.filter(([, options]) => options?.method === "POST").length,
    ).toBe(0);
  });

  it("archives an active policy", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerAssistantPoliciesScreen />);

    await waitFor(() => expect(getByLabelText("Archive policy_1")).toBeTruthy());
    fireEvent.press(getByLabelText("Archive policy_1"));

    await waitFor(() => expect(getByText("Archived")).toBeTruthy());
    expect(
      (apiFetch as jest.Mock).mock.calls.some(
        ([path, options]) => path === "/api/assistant/policies/policy_1" && options?.method === "DELETE",
      ),
    ).toBe(true);
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation(() => Promise.reject(new Error("Failed to load policies")));

    const { getByText } = render(<OwnerAssistantPoliciesScreen />);

    await waitFor(() => expect(getByText("Failed to load policies")).toBeTruthy());
  });
});
