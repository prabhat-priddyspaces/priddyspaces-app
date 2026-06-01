import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
          {
            public_id: "loc_2",
            organization_public_id: "org_2",
            name: "Rochester",
            address: "New York 104",
            city: "Rochester",
            timezone: "America/New_York",
            status: "inactive",
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
          {
            public_id: "org_2",
            name: "Rochester Workspace",
            review_status: "approved",
          },
        ]);
      }
      if (path === "/api/owner/marketplace-readiness") {
        return Promise.resolve([]);
      }
      if (path === "/api/booking-requests?status=approved") {
        const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        return Promise.resolve([
          { public_id: "req_1", location_public_id: "loc_1", end_datetime: future },
          { public_id: "req_2", location_public_id: "loc_1", end_datetime: future },
          { public_id: "req_3", location_public_id: "loc_2", end_datetime: past },
        ]);
      }
      if (path === "/api/locations/loc_1/spaces") {
        return Promise.resolve([{ public_id: "space_1", availability_status: "available" }]);
      }
      if (path === "/api/locations/loc_2/spaces") {
        return Promise.resolve([{ public_id: "space_2", availability_status: "available" }]);
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
    expect(await screen.findByText("Approval request sent to Admins.")).toBeInTheDocument();
  });

  it("shows corrected card metrics, actions, and functional filters", async () => {
    render(<LocationList />);

    expect(await screen.findByText("Downtown")).toBeInTheDocument();
    const approvedMetrics = screen.getAllByText("Upcoming approved");
    expect(approvedMetrics[0]).toBeInTheDocument();
    expect(within(approvedMetrics[0].parentElement as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Inactive", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Map view" })).not.toBeInTheDocument();

    expect(screen.getAllByRole("link", { name: "Manage rooms" })[0]).toHaveAttribute(
      "href",
      "/owner/locations/spaces?locationId=loc_1",
    );
    expect(screen.getAllByRole("link", { name: "Edit" })[0]).toHaveAttribute(
      "href",
      "/owner/locations/loc_1/edit",
    );
    expect(screen.getAllByRole("link", { name: "Add space" })[0]).toHaveAttribute(
      "href",
      "/owner/spaces/new?locationId=loc_1",
    );

    fireEvent.change(screen.getByLabelText("Filter locations by status"), { target: { value: "inactive" } });
    expect(screen.queryByText("Downtown")).not.toBeInTheDocument();
    expect(screen.getByText("Rochester", { selector: "div" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter locations by status"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Filter locations by city"), { target: { value: "Boca Raton" } });
    expect(screen.getByText("Downtown")).toBeInTheDocument();
    expect(screen.queryByText("Rochester", { selector: "div" })).not.toBeInTheDocument();
  });
});
