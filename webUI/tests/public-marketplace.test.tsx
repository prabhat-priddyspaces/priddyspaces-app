import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { PublicMarketplaceBrowser } from "../components/public-marketplace-browser";
import { PublicSpaceDetailView } from "../components/public-space-detail-view";

const { pushMock, apiFetchMock, reverseGeocodeMock, searchQuery } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  apiFetchMock: vi.fn(),
  reverseGeocodeMock: vi.fn(),
  searchQuery: { value: "q=Miami" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/spaces",
  useRouter: () => ({
    replace: vi.fn(),
    push: pushMock,
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(searchQuery.value),
}));

vi.mock("../lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => null),
  getActiveImpersonationToken: vi.fn(() => null),
}));

vi.mock("../components/public-marketplace-map", () => ({
  PublicMarketplaceMap: () => <div data-testid="public-marketplace-map" />,
}));

vi.mock("../components/public-location-mini-map", () => ({
  PublicLocationMiniMap: () => <div data-testid="public-location-mini-map" />,
}));

vi.mock("../components/use-address-autocomplete", () => ({
  useAddressAutocomplete: () => ({ warning: null }),
  reverseGeocode: reverseGeocodeMock,
}));

describe("public marketplace flows", () => {
  beforeEach(() => {
    searchQuery.value = "q=Miami";
    pushMock.mockReset();
    apiFetchMock.mockReset();
    reverseGeocodeMock.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("requests browser geolocation on first load when no location filter is present", async () => {
    searchQuery.value = "";
    reverseGeocodeMock.mockResolvedValue({ city: "Plantation", state: "FL", formatted: "Plantation, FL" });
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({
        coords: { latitude: 26.132, longitude: -80.2624 },
      } as GeolocationPosition),
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });
    apiFetchMock.mockResolvedValueOnce({
      meta: { total_locations: 0, page: 1, page_size: 20 },
      results: [],
    });

    render(<PublicMarketplaceBrowser routeKey="spaces" />);

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/spaces?q=Plantation%2C+FL&lat=26.132&lng=-80.2624&radius_miles=50",
      ),
    );
  });

  it("uses browser geolocation from the Locate me button", async () => {
    reverseGeocodeMock.mockResolvedValue({ city: "Plantation", state: "FL", formatted: "Plantation, FL" });
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({
        coords: { latitude: 26.132, longitude: -80.2624 },
      } as GeolocationPosition),
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });
    apiFetchMock.mockResolvedValueOnce({
      meta: { total_locations: 0, page: 1, page_size: 20 },
      results: [],
    });

    render(<PublicMarketplaceBrowser routeKey="spaces" />);
    fireEvent.click(screen.getByRole("button", { name: /Locate me/ }));

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/spaces?q=Plantation%2C+FL&lat=26.132&lng=-80.2624&radius_miles=50",
      ),
    );
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

    render(<PublicMarketplaceBrowser routeKey="spaces" />);

    expect(await screen.findByRole("heading", { name: "Fallback Place" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Open Fallback Place" }));
    expect(pushMock).toHaveBeenCalledWith("/locations/loc_1?q=Miami&route=spaces");
  });

  it("renders each matching space as its own search listing", async () => {
    apiFetchMock.mockResolvedValueOnce({
      meta: { total_locations: 1, page: 1, page_size: 20 },
      results: [
        {
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
          featured_image_url: null,
          location_amenities: ["WiFi"],
          matching_space_count: 2,
          featured_space_public_id: "space_1",
          starting_day_pass_price: 49,
          starting_monthly_price: null,
          starting_hourly_price: null,
          starting_membership_price: 299,
          spaces: [
            {
              public_id: "space_1",
              name: "Open Desk A1",
              space_type: "shared_desk",
              capacity: 1,
              availability_status: "available",
              availability_start_time: "08:00:00",
              availability_end_time: "18:00:00",
              price_daily: 49,
              price_monthly: null,
              hourly_price: null,
              membership_price: 299,
              amenities: ["WiFi"],
              image_url: null,
            },
            {
              public_id: "space_2",
              name: "Open Desk B4",
              space_type: "shared_desk",
              capacity: 3,
              availability_status: "available",
              availability_start_time: "08:00:00",
              availability_end_time: "18:00:00",
              price_daily: 59,
              price_monthly: null,
              hourly_price: null,
              membership_price: 299,
              amenities: ["WiFi"],
              image_url: null,
            },
          ],
        },
      ],
    });

    render(<PublicMarketplaceBrowser routeKey="spaces" />);

    expect(await screen.findByRole("heading", { name: "Open Desk A1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open Desk B4" })).toBeInTheDocument();
    expect(screen.getByText("Showing 2 listings")).toBeInTheDocument();
    expect(screen.queryByText(/matching spaces/i)).not.toBeInTheDocument();
  });

  it("marks private-office lease prices as estimated long-term prices in search", async () => {
    apiFetchMock.mockResolvedValueOnce({
      meta: { total_locations: 1, page: 1, page_size: 20 },
      results: [
        {
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
          featured_image_url: null,
          location_amenities: ["WiFi"],
          matching_space_count: 1,
          featured_space_public_id: "space_private",
          starting_day_pass_price: null,
          starting_monthly_price: 1800,
          starting_hourly_price: null,
          starting_membership_price: null,
          spaces: [
            {
              public_id: "space_private",
              name: "Private Office 4",
              space_type: "private_office",
              capacity: 4,
              availability_status: "available",
              availability_start_time: "09:00:00",
              availability_end_time: "17:00:00",
              price_daily: null,
              price_monthly: null,
              hourly_price: null,
              membership_price: 1800,
              amenities: ["WiFi"],
              image_url: null,
            },
          ],
        },
      ],
    });

    render(<PublicMarketplaceBrowser routeKey="private-offices" />);

    expect(await screen.findByRole("heading", { name: "Private Office 4" })).toBeInTheDocument();
    expect(screen.getByText("Lease $1,800/mo*")).toBeInTheDocument();
  });

  it("shows a designed fallback when a result image fails to load", async () => {
    apiFetchMock.mockResolvedValueOnce({
      meta: { total_locations: 1, page: 1, page_size: 20 },
      results: [
        {
          location_public_id: "loc_1",
          name: "Broken Image Place",
          address: "100 Main St",
          city: "Miami",
          state: "FL",
          postal_code: "33101",
          neighborhood: "Downtown",
          timezone: "America/New_York",
          lat: 25.7616,
          lng: -80.1918,
          featured_image_url: "https://assets.example.com/missing.png",
          location_amenities: ["WiFi"],
          matching_space_count: 1,
          featured_space_public_id: "space_1",
          starting_day_pass_price: 49,
          starting_monthly_price: null,
          starting_hourly_price: null,
          starting_membership_price: null,
        },
      ],
    });

    render(<PublicMarketplaceBrowser routeKey="spaces" />);

    const image = await screen.findByAltText("Broken Image Place");
    fireEvent.error(image);

    expect(screen.getAllByText("Priddyspaces").length).toBeGreaterThan(1);
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
      if (url.startsWith("/api/membership-plans/public")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    render(<PublicSpaceDetailView spaceId="space_1" backHref="/spaces" />);

    expect(await screen.findByRole("heading", { name: "Open Desk A1" })).toBeInTheDocument();
    expect(screen.queryByText("Hours")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Parking" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Transit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Included With Your Reservation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "We're Here To Help" })).not.toBeInTheDocument();
    expect(screen.queryByText("Book with confidence")).not.toBeInTheDocument();
  });

  it("shows structured public working hours with enabled days only", async () => {
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
            public_working_hours_enabled: true,
            public_working_hours: [
              { day: "monday", enabled: true, start_time: "09:00", end_time: "17:00" },
              { day: "saturday", enabled: false, start_time: null, end_time: null },
            ],
            public_parking_notes: [],
            public_transit_notes: [],
            public_included_items: [],
          },
          cancellation_policy: null,
          support_contacts: [],
        });
      }
      if (url.startsWith("/api/membership-plans/public")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    render(<PublicSpaceDetailView spaceId="space_1" backHref="/spaces" />);

    expect(await screen.findByRole("heading", { name: "Open Desk A1" })).toBeInTheDocument();
    expect(screen.getByText("Hours")).toBeInTheDocument();
    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("9:00 AM")).toBeInTheDocument();
    expect(screen.getByText("to 5:00 PM")).toBeInTheDocument();
    expect(screen.queryByText("Saturday")).not.toBeInTheDocument();
  });

  it("shows conference room all-day booking without recurrence controls", async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url.includes("/availability")) {
        return Promise.resolve({
          space_public_id: "space_1",
          timezone: "America/New_York",
          granularity_minutes: 120,
          availability_start_time: "09:00",
          availability_end_time: "18:30",
          hourly_price: 30,
          daily_price: 200,
          days: [{ date: "2026-06-01", fully_blocked: false, busy_intervals: [] }],
        });
      }
      if (url.startsWith("/api/marketplace/spaces/")) {
        return Promise.resolve({
          space: {
            public_id: "space_1",
            name: "Conference 14-B",
            space_type: "conference_room",
            capacity: 8,
            availability_status: "available",
            availability_start_time: "09:00:00",
            availability_end_time: "18:30:00",
            buffer_before_minutes: 0,
            buffer_after_minutes: 0,
            price_daily: 200,
            price_monthly: null,
            hourly_price: 30,
            membership_price: null,
            amenities: ["WiFi"],
            volume_discounts: [],
            booking_products: [
              {
                product_type: "hourly",
                booking_mode: "hourly",
                label: "Hourly reservation",
                price: "30.00",
                price_cents: 3000,
              },
              {
                product_type: "day_rate",
                booking_mode: "day_pass",
                label: "Day Rate",
                price: "200.00",
                price_cents: 20000,
              },
            ],
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
            public_working_hours_enabled: false,
            public_working_hours: [],
            public_parking_notes: [],
            public_transit_notes: [],
            public_included_items: [],
          },
          cancellation_policy: null,
          support_contacts: [],
        });
      }
      if (url.startsWith("/api/membership-plans/public")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    render(<PublicSpaceDetailView spaceId="space_1" backHref="/spaces" initialDate="2026-06-01" />);

    expect(await screen.findByRole("heading", { name: "Conference 14-B" })).toBeInTheDocument();
    expect(screen.getAllByText("Day Rate").length).toBeGreaterThan(0);
    expect(screen.getByText("All day")).toBeInTheDocument();
    expect(screen.queryByText("Recurrence")).not.toBeInTheDocument();
  });

  it("marks private-office lease prices on the detail page and checkout panel", async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url.includes("/availability")) {
        return Promise.resolve({
          space_public_id: "space_lease",
          timezone: "America/New_York",
          granularity_minutes: 60,
          availability_start_time: "09:00",
          availability_end_time: "17:00",
          hourly_price: null,
          daily_price: null,
          days: [{ date: "2026-06-01", fully_blocked: false, busy_intervals: [] }],
        });
      }
      if (url.startsWith("/api/membership-plans/public")) {
        return Promise.resolve([
          {
            public_id: "plan_month",
            booking_mode: "private_office_lease",
            name: "Month-to-month",
            description: null,
            price_cents: 200000,
            billing_cycle: "monthly",
            commitment_months: null,
            included_meeting_room_hours_per_month: 0,
            overage_hourly_rate_cents: null,
            seats_per_plan: 4,
            space_capacity: 4,
            available_seats: 1,
          },
          {
            public_id: "plan_6",
            booking_mode: "private_office_lease",
            name: "6-month Term",
            description: null,
            price_cents: 190000,
            billing_cycle: "monthly",
            commitment_months: 6,
            included_meeting_room_hours_per_month: 0,
            overage_hourly_rate_cents: null,
            seats_per_plan: 4,
            space_capacity: 4,
            available_seats: 1,
          },
        ]);
      }
      if (url.startsWith("/api/marketplace/spaces/")) {
        return Promise.resolve({
          space: {
            public_id: "space_lease",
            name: "Private Office 4",
            space_type: "private_office",
            capacity: 4,
            availability_status: "available",
            availability_start_time: "09:00:00",
            availability_end_time: "17:00:00",
            price_daily: null,
            price_monthly: null,
            hourly_price: null,
            membership_price: 1800,
            amenities: ["WiFi"],
            booking_products: [
              {
                product_type: "lease",
                booking_mode: "private_office_lease",
                label: "Lease",
                price: "1800.00",
                price_cents: 180000,
              },
            ],
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
            public_working_hours_enabled: false,
            public_working_hours: [],
            public_parking_notes: [],
            public_transit_notes: [],
            public_included_items: [],
          },
          cancellation_policy: null,
          support_contacts: [],
        });
      }
      return Promise.resolve([]);
    });

    render(
      <PublicSpaceDetailView
        spaceId="space_lease"
        backHref="/private-offices"
        initialMoveInDate="2026-06-01"
      />,
    );

    expect(await screen.findByRole("heading", { name: "Private Office 4" })).toBeInTheDocument();
    expect(screen.getByText("$1,800/month*")).toBeInTheDocument();
    expect(await screen.findByText("$1,900/mo*")).toBeInTheDocument();
  });
});
