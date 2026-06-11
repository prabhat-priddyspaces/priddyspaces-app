import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { AdminUsersScreen } from "../src/screens/admin/AdminUsersScreen";
import { AdminCalendarScreen } from "../src/screens/admin/AdminCalendarScreen";
import { apiFetch } from "../src/lib/api";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

describe("AdminUsersScreen", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it("filters users and sends owner invites with web payloads", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (String(path).startsWith("/api/admin/users?")) {
        return Promise.resolve({
          results: [
            {
              public_id: "user_1",
              email: "customer@test.com",
              name: "Casey Member",
              app_role: "member",
              platform_role: null,
              is_active: true,
              email_verified: true,
              organization_count: 1,
              bookings: 4,
              payments: 3,
              subscriptions: 1,
            },
          ],
          total: 1,
        });
      }
      if (path === "/api/admin/owner-invites" && options?.method === "POST") return Promise.resolve({});
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText } = render(<AdminUsersScreen />);

    await waitFor(() => expect(getByText("Casey Member")).toBeTruthy());

    fireEvent.press(getByLabelText("Role owner"));
    await waitFor(() => {
      expect(
        (apiFetch as jest.Mock).mock.calls.some(([path]) => String(path).includes("role=owner")),
      ).toBe(true);
    });

    fireEvent.changeText(getByLabelText("Owner invite email"), "newowner@test.com");
    fireEvent.changeText(getByLabelText("Invite company"), "New Co");
    fireEvent.press(getByLabelText("Send owner invite"));
    await waitFor(() => expect(getByText("Owner invite sent.")).toBeTruthy());
    const inviteCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/admin/owner-invites" && options?.method === "POST",
    );
    expect(JSON.parse(inviteCall[1].body)).toEqual({
      email: "newowner@test.com",
      company_name: "New Co",
    });
  });
});

describe("AdminCalendarScreen", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it("loads the platform calendar and filters by company", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/admin/owner-companies") {
        return Promise.resolve([{ public_id: "org_1", name: "Acme", display_name: null }]);
      }
      if (String(path).startsWith("/api/admin/calendar?")) {
        return Promise.resolve({
          events: [
            {
              kind: "booking",
              public_id: "evt_1",
              space_name: "Board Room",
              space_type: "conference_room",
              location_name: "Rochester Hub",
              start: "2026-06-11T14:00:00Z",
              end: "2026-06-11T16:00:00Z",
              status: "booking.confirmed",
              member: { public_id: "user_1", name: "Casey Member", email: "customer@test.com" },
            },
          ],
        });
      }
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText } = render(<AdminCalendarScreen />);

    await waitFor(() => expect(getByText("Board Room")).toBeTruthy());
    fireEvent.press(getByLabelText("Company Acme"));

    await waitFor(() => {
      const calls = (apiFetch as jest.Mock).mock.calls.filter(([path]) =>
        String(path).startsWith("/api/admin/calendar?"),
      );
      expect(calls[calls.length - 1][0]).toContain("organization_public_id=org_1");
    });
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/admin/owner-companies") return Promise.resolve([]);
      return Promise.reject(new Error("Failed to load calendar"));
    });

    const { getByText } = render(<AdminCalendarScreen />);

    await waitFor(() => expect(getByText("Failed to load calendar")).toBeTruthy());
  });
});
