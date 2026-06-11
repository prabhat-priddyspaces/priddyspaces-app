import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { AdminPlatformTeamScreen } from "../src/screens/admin/AdminPlatformTeamScreen";
import { AdminAssistantQualityScreen } from "../src/screens/admin/AdminAssistantQualityScreen";
import { apiFetch } from "../src/lib/api";

let mockMe: Record<string, unknown> = { platform_role: "superadmin" };

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token", me: mockMe }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const teamMember = {
  public_id: "pt_1",
  email: "support@priddyspaces.com",
  name: "Sam Support",
  first_name: "Sam",
  last_name: "Support",
  role: "support",
  is_active: true,
};

describe("AdminPlatformTeamScreen", () => {
  beforeEach(() => {
    mockMe = { platform_role: "superadmin" };
    (apiFetch as jest.Mock).mockReset();
  });

  it("invites, updates, and removes team members with web payloads", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      const method = options?.method || "GET";
      if (path === "/api/admin/platform-team" && method === "GET") return Promise.resolve([teamMember]);
      if (path === "/api/admin/platform-team" && method === "POST") return Promise.resolve({});
      if (path === "/api/admin/platform-team/pt_1" && method === "PATCH") return Promise.resolve({});
      if (path === "/api/admin/platform-team/pt_1" && method === "DELETE") return Promise.resolve({});
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText } = render(<AdminPlatformTeamScreen />);

    await waitFor(() => expect(getByText("Sam Support")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Invite email"), "new@priddyspaces.com");
    fireEvent.press(getByLabelText("Invite role admin"));
    fireEvent.press(getByLabelText("Invite member"));
    await waitFor(() => {
      const postCall = (apiFetch as jest.Mock).mock.calls.find(
        ([path, options]) => path === "/api/admin/platform-team" && options?.method === "POST",
      );
      expect(JSON.parse(postCall[1].body)).toEqual({ email: "new@priddyspaces.com", role: "admin" });
    });

    fireEvent.press(getByLabelText("Set pt_1 role admin"));
    fireEvent.press(getByLabelText("Save pt_1"));
    await waitFor(() => {
      const patchCall = (apiFetch as jest.Mock).mock.calls.find(
        ([path, options]) => path === "/api/admin/platform-team/pt_1" && options?.method === "PATCH",
      );
      expect(JSON.parse(patchCall[1].body)).toEqual({
        first_name: "Sam",
        last_name: "Support",
        role: "admin",
        is_active: true,
      });
    });

    fireEvent.press(getByLabelText("Remove pt_1"));
    await waitFor(() => {
      expect(
        (apiFetch as jest.Mock).mock.calls.some(
          ([path, options]) => path === "/api/admin/platform-team/pt_1" && options?.method === "DELETE",
        ),
      ).toBe(true);
    });
  });

  it("blocks non-superadmins like web", async () => {
    mockMe = { platform_role: "admin" };
    (apiFetch as jest.Mock).mockResolvedValue([]);

    const { getByText, queryByLabelText } = render(<AdminPlatformTeamScreen />);

    await waitFor(() =>
      expect(getByText("Only superadmins can manage platform team accounts.")).toBeTruthy(),
    );
    expect(queryByLabelText("Invite member")).toBeNull();
  });
});

describe("AdminAssistantQualityScreen", () => {
  beforeEach(() => {
    mockMe = { platform_role: "superadmin" };
    (apiFetch as jest.Mock).mockReset();
  });

  it("renders quality metrics and breakdowns", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({
      metrics: { conversations: 320, low_rated: 4 },
      low_rated_conversations: [{ conversation_public_id: "conv_1", reason: "Wrong door code" }],
      missing_policy_categories: [{ category: "door_code", count: 7 }],
      reliability_events: [{ kind: "tool_timeout", count: 3 }],
      tool_failure_rates: [{ tool: "booking_lookup", failures: 2 }],
      usage_by_persona: [{ audience: "member", conversations: 250 }],
    });

    const { getByText } = render(<AdminAssistantQualityScreen />);

    await waitFor(() => expect(getByText("320")).toBeTruthy());
    expect(getByText("tool timeout")).toBeTruthy();
    expect(getByText("booking_lookup")).toBeTruthy();
    expect(getByText("door code")).toBeTruthy();
    expect(getByText("Wrong door code")).toBeTruthy();
  });
});
