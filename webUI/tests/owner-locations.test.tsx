import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { LocationList } from "../components/location-list";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

describe("LocationList", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/api/locations") {
        return Promise.resolve([
          {
            public_id: "loc_1",
            organization_public_id: "org_1",
            name: "Downtown",
            address: "West Palmetto Park Road",
            city: "Boca Raton",
            timezone: "America/New_York",
            status: "active",
            amenities: [],
          },
        ]);
      }
      if (path === "/api/orgs") {
        return Promise.resolve([
          {
            public_id: "org_1",
            name: "Boca Raton Workspace",
            review_status: "pending",
          },
        ]);
      }
      if (path === "/api/locations/loc_1/spaces") {
        return Promise.resolve([{ public_id: "space_1", availability_status: "available" }]);
      }
      if (path === "/api/orgs/org_1/approval-request" && opts?.method === "POST") {
        return Promise.resolve({
          public_id: "org_1",
          review_status: "pending",
          recipients_notified: 1,
        });
      }
      return Promise.reject(new Error(`Unhandled path: ${path}`));
    });
  });

  it("shows marketplace review status and sends an approval request", async () => {
    render(<LocationList />);

    expect(await screen.findByText("Marketplace in review")).toBeInTheDocument();
    expect(screen.getByText(/hidden from public search/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Request approval" }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/orgs/org_1/approval-request",
        { method: "POST" },
        "token",
      ),
    );
    expect(await screen.findByText("Approval request sent to 1 super admin.")).toBeInTheDocument();
  });
});
