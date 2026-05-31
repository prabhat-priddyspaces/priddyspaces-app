import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { EditLocationClient } from "../app/owner/locations/[locationId]/edit/client";

const { apiFetchMock, pushMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ locationId: "loc_1" }),
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("../lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../components/use-address-autocomplete", () => ({
  useAddressAutocomplete: () => ({ warning: null }),
}));

describe("EditLocationClient", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    pushMock.mockReset();
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/locations/loc_1" && options?.method === "GET") {
        return Promise.resolve({
          public_id: "loc_1",
          organization_public_id: "org_1",
          name: "Downtown",
          address: "100 Main St",
          city: "Austin",
          state: "TX",
          postal_code: "78701",
          neighborhood: "Downtown",
          timezone: "America/Chicago",
          booking_granularity: "60m",
          status: "active",
          lat: null,
          lng: null,
          public_phone: null,
          public_email: null,
          public_hours_weekdays: null,
          public_hours_weekends: null,
          public_working_hours_enabled: false,
          public_working_hours: [],
          public_parking_notes: null,
          public_transit_notes: null,
          public_included_items: null,
          amenities: [],
        });
      }
      if (path === "/api/orgs/org_1/amenities") {
        return Promise.resolve([]);
      }
      if (path === "/api/locations/loc_1" && options?.method === "PATCH") {
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`Unhandled path: ${path}`));
    });
  });

  it("updates booking granularity with a dropdown value", async () => {
    render(<EditLocationClient />);

    const granularity = await screen.findByLabelText("Booking granularity");
    expect(granularity).toHaveValue("60m");

    fireEvent.change(granularity, { target: { value: "120m" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/locations/loc_1",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"booking_granularity":"120m"'),
        }),
        "token",
      ),
    );
    expect(pushMock).toHaveBeenCalledWith("/owner/locations");
  });
});
