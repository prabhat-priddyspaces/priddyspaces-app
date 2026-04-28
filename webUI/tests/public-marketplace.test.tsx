import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { PublicMarketplaceBrowser } from "../components/public-marketplace-browser";
import { PublicSpaceDetailView } from "../components/public-space-detail-view";

const { pushMock, apiFetchMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/coworking",
  useRouter: () => ({
    replace: vi.fn(),
    push: pushMock,
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams("q=Miami"),
}));

vi.mock("../lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => null),
}));

vi.mock("../components/public-marketplace-map", () => ({
  PublicMarketplaceMap: () => <div data-testid="public-marketplace-map" />,
}));

vi.mock("../components/public-location-mini-map", () => ({
  PublicLocationMiniMap: () => <div data-testid="public-location-mini-map" />,
}));

describe("public marketplace flows", () => {
  beforeEach(() => {
    pushMock.mockReset();
    apiFetchMock.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("falls back to the location page when a result has no featured space", async () => {
    apiFetchMock.mockResolvedValueOnce({
      meta: { total_locations: 1, page: 1, page_size: 20 },
      results: [
        {
          location_public_id: "loc_1",
          name: "Fallback Place",
          address: "100 Main St",
          city: "Miami",
          state: "FL",
          postal_code: "33101",
          neighborhood: "Downtown",
          timezone: "America/New_York",
          lat: 25.7616,
          lng: -80.1918,
          featured_image_url: null,
          location_amenities: ["WiFi"],
          matching_space_count: 1,
          featured_space_public_id: null,
          starting_day_pass_price: 49,
          starting_monthly_price: null,
          starting_hourly_price: null,
          starting_membership_price: null,
        },
      ],
    });

    render(<PublicMarketplaceBrowser routeKey="coworking" />);

    expect(await screen.findByRole("heading", { name: "Fallback Place" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Open Fallback Place" }));
    expect(pushMock).toHaveBeenCalledWith("/coworking/_?q=Miami&id=loc_1");
  });

  it("hides empty optional sections on the public detail page", async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url.includes("/availability")) {
        return Promise.resolve({
          space_public_id: "space_1",
          timezone: "America/New_York",
          granularity_minutes: 60,
          availability_start_time: "08:00",
          availability_end_time: "18:00",
          hourly_price: null,
          daily_price: 69,
          days: [],
        });
      }
      if (url.startsWith("/api/marketplace/spaces/")) {
        return Promise.resolve({
          space: {
            public_id: "space_1",
            name: "Open Desk A1",
            space_type: "shared_desk",
            capacity: 1,
            availability_status: "available",
            availability_start_time: "08:00:00",
            availability_end_time: "18:00:00",
            price_daily: 69,
            price_monthly: null,
            hourly_price: null,
            membership_price: 299,
            amenities: ["WiFi"],
          },
          images: [],
          location: {
            location_public_id: "loc_1",
            name: "Brickell Commons",
            address: "100 Main St",
            city: "Miami",
            state: "FL",
            postal_code: "33101",
            neighborhood: "Downtown",
            timezone: "America/New_York",
            lat: 25.7616,
            lng: -80.1918,
            public_phone: null,
            public_email: null,
            public_hours_weekdays: null,
            public_hours_weekends: null,
            public_parking_notes: [],
            public_transit_notes: [],
            public_included_items: [],
          },
          cancellation_policy: null,
          support_contacts: [],
        });
      }
      if (url.startsWith("/api/subscription-plans/public")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    render(<PublicSpaceDetailView spaceId="space_1" backHref="/coworking" />);

    expect(await screen.findByRole("heading", { name: "Open Desk A1" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Parking" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Transit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Included With Your Reservation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "We're Here To Help" })).not.toBeInTheDocument();
    expect(screen.queryByText("Book with confidence")).not.toBeInTheDocument();
  });
});
