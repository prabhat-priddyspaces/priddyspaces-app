import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerMembersScreen } from "../src/screens/owner/OwnerMembersScreen";
import { OwnerMemberDetailScreen } from "../src/screens/owner/OwnerMemberDetailScreen";
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

const stats = {
  total_bookings: 12,
  confirmed_bookings: 9,
  canceled_bookings: 2,
  no_shows: 1,
  open_requests: 1,
  total_revenue_cents: 145000,
  active_subscriptions: 1,
  first_booking_at: "2026-01-05T00:00:00Z",
  last_booking_at: "2026-06-01T00:00:00Z",
};

const memberRow = {
  user_public_id: "user_1",
  organization_public_id: "org_1",
  name: "Casey Member",
  email: "customer@test.com",
  status: "active",
  phone: "5551234567",
  company_name: "Acme Corp",
  tags: ["vip", "monthly"],
  stats,
};

describe("OwnerMembersScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    (apiFetch as jest.Mock).mockReset();
  });

  it("lists members with stats and opens the detail screen", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
      if (path.startsWith("/api/owner/members?")) return Promise.resolve([memberRow]);
      return Promise.resolve([]);
    });

    const { getByText, getByLabelText } = render(<OwnerMembersScreen />);

    await waitFor(() => expect(getByText("Casey Member")).toBeTruthy());
    expect(getByText("active • 9 confirmed / 12 total • $1,450")).toBeTruthy();
    expect(getByText("vip • monthly")).toBeTruthy();

    const listCall = (apiFetch as jest.Mock).mock.calls.find(([path]) =>
      String(path).startsWith("/api/owner/members?"),
    );
    expect(listCall[0]).toContain("organization_public_id=org_1");

    fireEvent.press(getByLabelText("Open member Casey Member"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerMemberDetail", {
      publicId: "user_1",
      orgId: "org_1",
      name: "Casey Member",
    });
  });

  it("applies search and status filters to the query", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
      if (path.startsWith("/api/owner/members?")) return Promise.resolve([memberRow]);
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText } = render(<OwnerMembersScreen />);

    await waitFor(() => expect(getByText("Casey Member")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Search members"), "casey");
    fireEvent.press(getByLabelText("Status blocked"));

    await waitFor(() => {
      const calls = (apiFetch as jest.Mock).mock.calls.filter(([path]) =>
        String(path).startsWith("/api/owner/members?"),
      );
      const last = calls[calls.length - 1][0];
      expect(last).toContain("search=casey");
      expect(last).toContain("status=blocked");
    });
  });
});

describe("OwnerMemberDetailScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockRouteParams = { publicId: "user_1", orgId: "org_1", name: "Casey Member" };
    (apiFetch as jest.Mock).mockReset();
  });

  function mockDetail() {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path.startsWith("/api/owner/members/user_1?") && (options?.method || "GET") === "GET") {
        return Promise.resolve({ ...memberRow, notes: "Likes window seats" });
      }
      if (path.startsWith("/api/owner/members/user_1?") && options?.method === "PATCH") {
        return Promise.resolve({ ...memberRow, notes: "Updated", status: "blocked" });
      }
      if (path.startsWith("/api/owner/calendar?")) {
        return Promise.resolve({
          events: [
            {
              kind: "booking",
              public_id: "evt_1",
              space_name: "Board Room",
              space_type: "conference_room",
              location_name: "Rochester Hub",
              start: "2099-01-01T10:00:00Z",
              end: "2099-01-01T12:00:00Z",
              status: "booking.confirmed",
              member: { public_id: "user_1", name: "Casey Member", email: "customer@test.com" },
            },
            {
              kind: "booking",
              public_id: "evt_2",
              space_name: "Desk 4",
              space_type: "shared_desk",
              location_name: "Rochester Hub",
              start: "2020-01-01T10:00:00Z",
              end: "2020-01-01T12:00:00Z",
              status: "booking.confirmed",
              member: { public_id: "user_1", name: "Casey Member", email: "customer@test.com" },
            },
          ],
        });
      }
      return Promise.resolve([]);
    });
  }

  it("loads stats, profile drafts, and split activity", async () => {
    mockDetail();
    const { getByText, getByLabelText } = render(<OwnerMemberDetailScreen />);

    await waitFor(() => expect(getByText("Casey Member")).toBeTruthy());
    expect(getByText("$1,450")).toBeTruthy();
    expect(getByLabelText("Notes").props.value).toBe("Likes window seats");
    expect(getByText("Upcoming (1)")).toBeTruthy();
    expect(getByText("Past (1)")).toBeTruthy();

    fireEvent.press(getByLabelText("Open activity evt_1"));
    expect(mockNavigate).toHaveBeenCalledWith("BookingDetail", { bookingId: "evt_1" });
  });

  it("saves CRM edits with the web payload", async () => {
    mockDetail();
    const { getByLabelText, getByText } = render(<OwnerMemberDetailScreen />);

    await waitFor(() => expect(getByLabelText("Notes").props.value).toBe("Likes window seats"));
    fireEvent.press(getByLabelText("Set status blocked"));
    fireEvent.changeText(getByLabelText("Tags (comma separated)"), "vip, late-payer ,");
    fireEvent.changeText(getByLabelText("Notes"), "Updated");
    fireEvent.press(getByLabelText("Save member"));

    await waitFor(() => expect(getByText("Saved")).toBeTruthy());
    const patchCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => String(path).startsWith("/api/owner/members/user_1?") && options?.method === "PATCH",
    );
    expect(patchCall[0]).toContain("organization_public_id=org_1");
    expect(JSON.parse(patchCall[1].body)).toEqual({
      status: "blocked",
      phone: "5551234567",
      company_name: "Acme Corp",
      tags: ["vip", "late-payer"],
      notes: "Updated",
    });
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation(() => Promise.reject(new Error("Failed to load member")));

    const { getByText } = render(<OwnerMemberDetailScreen />);

    await waitFor(() => expect(getByText("Failed to load member")).toBeTruthy());
  });
});
