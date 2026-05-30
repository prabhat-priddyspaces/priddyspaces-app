import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerTeamScreen } from "../src/screens/owner/OwnerTeamScreen";
import { apiFetch } from "../src/lib/api";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

describe("OwnerTeamScreen notification toggles", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === "GET") {
        return Promise.resolve([
          {
            public_id: "om_1",
            user_public_id: "user_1",
            user_email: "ops@example.com",
            role: "admin",
            can_override_pricing: false,
            receives_booking_start_push: true,
            receives_booking_end_push: true,
          },
        ]);
      }
      return Promise.resolve({});
    });
  });

  it("updates team member start reminder preferences", async () => {
    const screen = render(<OwnerTeamScreen />);

    fireEvent.changeText(screen.getByPlaceholderText("Organization public id"), "org_1");
    expect(await screen.findByText("ops@example.com")).toBeTruthy();
    fireEvent(screen.getByTestId("team-start-push-om_1"), "valueChange", false);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/orgs/org_1/members/om_1",
        { method: "PATCH", body: JSON.stringify({ receives_booking_start_push: false }) },
        "token"
      );
    });
  });
});
