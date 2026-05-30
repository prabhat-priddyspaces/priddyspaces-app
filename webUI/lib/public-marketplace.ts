import type { PublicWorkingHour } from "@/lib/working-hours";
import { formatUsd, type MoneyValue } from "@/lib/money";

export type PublicMarketplaceRoute = "spaces" | "private-offices" | "meeting-rooms";
export type PublicMarketplaceApiCategory = "coworking" | "private_office" | "meeting_room";
type SearchLike = Pick<URLSearchParams, "get">;

export interface PublicMarketplaceConfig {
  routeKey: PublicMarketplaceRoute;
  apiCategory: PublicMarketplaceApiCategory;
  label: string;
  title: string;
  subtitle: string;
  queryPlaceholder: string;
  priceParamKey: "max_price" | "max_price_monthly";
  priceLabel: string;
  primaryPriceLabel: string;
  secondaryPriceLabel?: string;
}

export interface MarketplaceLocationSummary {
  location_public_id: string;
  name: string;
  address: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  neighborhood: string | null;
  timezone: string;
  lat: number | null;
  lng: number | null;
  featured_image_url: string | null;
  location_amenities: string[];
  matching_space_count: number;
  featured_space_public_id: string | null;
  starting_day_pass_price: MoneyValue | null;
  starting_monthly_price: MoneyValue | null;
  starting_hourly_price: MoneyValue | null;
  starting_membership_price: number | null;
  distance_miles: number | null;
  public_working_hours_enabled?: boolean;
  public_working_hours?: PublicWorkingHour[];
}

export const DEFAULT_RADIUS_MILES = 50;
export const MAX_RADIUS_MILES = 1000;

export interface MarketplaceLocationSearchResponse {
  meta: {
    total_locations: number;
    page: number;
    page_size: number;
  };
  results: MarketplaceLocationSummary[];
}

export interface MarketplaceLocationSpace {
  public_id: string;
  name: string;
  space_type: string;
  capacity: number;
  availability_status: string;
  availability_start_time: string | null;
  availability_end_time: string | null;
  price_daily: MoneyValue | null;
  price_monthly: MoneyValue | null;
  hourly_price: MoneyValue | null;
  membership_price: number | null;
  amenities: string[];
  image_url: string | null;
}

export interface MarketplaceLocationDetail extends MarketplaceLocationSummary {
  spaces: MarketplaceLocationSpace[];
}

export interface MarketplaceSpaceImage {
  public_id: string;
  image_url: string;
  is_primary: boolean;
  sort_order: number;
}

export interface MarketplaceVolumeDiscountTier {
  min_hours: number;
  discount_percent: number;
}

export interface MarketplaceSpaceDetailSpace {
  public_id: string;
  name: string;
  space_type: string;
  capacity: number;
  availability_status: string;
  availability_start_time: string | null;
  availability_end_time: string | null;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  price_daily: MoneyValue | null;
  price_monthly: MoneyValue | null;
  hourly_price: MoneyValue | null;
  membership_price: number | null;
  amenities: string[];
  volume_discounts?: MarketplaceVolumeDiscountTier[];
}

export interface MarketplaceSpaceDetailLocation {
  location_public_id: string;
  organization_name: string | null;
  name: string;
  address: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  neighborhood: string | null;
  timezone: string;
  lat: number | null;
  lng: number | null;
  public_phone: string | null;
  public_email: string | null;
  public_hours_weekdays: string | null;
  public_hours_weekends: string | null;
  public_working_hours_enabled?: boolean;
  public_working_hours?: PublicWorkingHour[];
  public_parking_notes: string[];
  public_transit_notes: string[];
  public_included_items: string[];
}

export interface MarketplaceCancellationPolicy {
  cancel_window_hours: number;
  refund_percent: number;
  tiers?: Array<{
    min_hours_before_start: number;
    refund_percent: number;
  }>;
}

export interface MarketplaceSupportContact {
  name: string;
  title: string;
}

export interface MarketplaceSpaceDetailResponse {
  space: MarketplaceSpaceDetailSpace;
  images: MarketplaceSpaceImage[];
  location: MarketplaceSpaceDetailLocation;
  cancellation_policy: MarketplaceCancellationPolicy | null;
  support_contacts: MarketplaceSupportContact[];
}

export interface SpaceAvailabilityInterval {
  start: string;
  end: string;
}

export interface SpaceAvailabilityDay {
  date: string;
  fully_blocked: boolean;
  busy_intervals: SpaceAvailabilityInterval[];
}

export interface SpaceAvailabilityResponse {
  space_public_id: string;
  timezone: string;
  granularity_minutes: number | null;
  availability_start_time: string | null;
  availability_end_time: string | null;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  hourly_price: MoneyValue | null;
  daily_price: MoneyValue | null;
  days: SpaceAvailabilityDay[];
}

export const PUBLIC_MARKETPLACE_CONFIGS: Record<PublicMarketplaceRoute, PublicMarketplaceConfig> = {
  "spaces": {
    routeKey: "spaces",
    apiCategory: "coworking",
    label: "Coworking & Day Passes",
    title: "Find Your Next Coworking Spot",
    subtitle: "Browse active Priddyspaces locations with day-pass pricing, memberships, and a live map.",
    queryPlaceholder: "Neighborhood, city, state, or ZIP",
    priceParamKey: "max_price",
    priceLabel: "Max day-pass price",
    primaryPriceLabel: "Day Pass",
    secondaryPriceLabel: "Membership",
  },
  "private-offices": {
    routeKey: "private-offices",
    apiCategory: "private_office",
    label: "Private Offices",
    title: "Compare Private Office Inventory",
    subtitle: "Search by neighborhood, capacity, and monthly pricing to find the right office footprint.",
    queryPlaceholder: "Neighborhood, city, state, or ZIP",
    priceParamKey: "max_price_monthly",
    priceLabel: "Max monthly price",
    primaryPriceLabel: "Monthly",
  },
  "meeting-rooms": {
    routeKey: "meeting-rooms",
    apiCategory: "meeting_room",
    label: "Meeting Rooms",
    title: "Book-Ready Meeting Rooms",
    subtitle: "Filter by capacity, time window, and pricing while exploring the map alongside the results.",
    queryPlaceholder: "Neighborhood, city, state, or ZIP",
    priceParamKey: "max_price",
    priceLabel: "Max room price",
    primaryPriceLabel: "Hourly",
    secondaryPriceLabel: "Day Rate",
  },
};

export const PUBLIC_MARKETPLACE_TABS = Object.values(PUBLIC_MARKETPLACE_CONFIGS);

export function formatLocationAddress(location: Pick<MarketplaceLocationSummary, "address" | "city" | "state" | "postal_code">) {
  return [location.address, [location.city, location.state, location.postal_code].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" ");
}

export function buildApiSearchParams(
  config: PublicMarketplaceConfig,
  searchParams: SearchLike,
) {
  const params = new URLSearchParams();
  params.set("category", config.apiCategory);

  const q = searchParams.get("q");
  const date = searchParams.get("date");
  const startTime = searchParams.get("start_time");
  const endTime = searchParams.get("end_time");
  const capacity = searchParams.get("capacity");
  const sort = searchParams.get("sort");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radiusMiles = searchParams.get("radius_miles");
  const maxPrice =
    config.priceParamKey === "max_price_monthly"
      ? searchParams.get("max_price_monthly")
      : searchParams.get("max_price");

  if (q) params.set("q", q);
  if (date) params.set("date", date);
  if (startTime) params.set("start_time", startTime);
  if (endTime) params.set("end_time", endTime);
  if (capacity) params.set("capacity", capacity);
  if (sort) params.set("sort", sort);
  if (maxPrice) params.set("max_price", maxPrice);
  if (lat && lng) {
    params.set("lat", lat);
    params.set("lng", lng);
    if (radiusMiles) {
      params.set("radius_miles", radiusMiles);
    }
    // q reflects the place the user picked from autocomplete (e.g.
    // "Plantation, FL"); the radius does the actual location filtering,
    // and keeping q as a substring filter would miss every nearby city.
    params.delete("q");
  }

  return params;
}

export function buildTabHref(
  routeKey: PublicMarketplaceRoute,
  searchParams: SearchLike,
) {
  const next = new URLSearchParams();
  const transferableKeys = [
    "q",
    "capacity",
    "sort",
    "date",
    "start_time",
    "end_time",
    "lat",
    "lng",
    "radius_miles",
  ];
  for (const key of transferableKeys) {
    const value = searchParams.get(key);
    if (value) next.set(key, value);
  }
  const maxPrice = searchParams.get("max_price") || searchParams.get("max_price_monthly");
  if (maxPrice) {
    next.set(routeKey === "private-offices" ? "max_price_monthly" : "max_price", maxPrice);
  }
  const query = next.toString();
  return query ? `/${routeKey}?${query}` : `/${routeKey}`;
}

export function buildBackHref(routeKey: PublicMarketplaceRoute, search: string) {
  return search ? `/${routeKey}?${search}` : `/${routeKey}`;
}

export function buildMarketplaceSpaceHref(
  spacePublicId: string,
  routeKey: PublicMarketplaceRoute,
  search: string,
) {
  const next = new URLSearchParams();
  next.set("back", buildBackHref(routeKey, search));

  const current = new URLSearchParams(search);
  for (const key of ["date", "start_time", "end_time"]) {
    const value = current.get(key);
    if (value) {
      next.set(key, value);
    }
  }

  return `/spaces/${encodeURIComponent(spacePublicId)}?${next.toString()}`;
}

export function buildMarketplaceLocationHref(
  routeKey: PublicMarketplaceRoute,
  locationPublicId: string,
  search: string,
) {
  const next = new URLSearchParams(search);
  next.delete("id");
  next.set("route", routeKey);
  const query = next.toString();
  return query
    ? `/locations/${encodeURIComponent(locationPublicId)}?${query}`
    : `/locations/${encodeURIComponent(locationPublicId)}`;
}

export function formatSpaceTypeLabel(spaceType: string) {
  return spaceType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type LeaseBookingMode = "private_office_lease" | "suite_lease";

export interface MembershipPlanPublic {
  public_id: string;
  booking_mode: string;
  name: string;
  description: string | null;
  price_cents: number;
  billing_cycle: string;
  commitment_months: number | null;
  included_meeting_room_hours_per_month: number;
  overage_hourly_rate_cents: number | null;
  seats_per_plan: number;
  space_capacity: number;
  available_seats: number | null;
}

export function leaseBookingModeForSpaceType(spaceType: string): LeaseBookingMode | null {
  if (spaceType === "private_office") return "private_office_lease";
  if (spaceType === "suite") return "suite_lease";
  return null;
}

export function formatLeasePrice(cents: number, billingCycle: string = "monthly") {
  const dollars = Math.round(cents / 100);
  const formatted = dollars.toLocaleString();
  const suffix = billingCycle === "yearly" ? "/yr" : "/mo";
  return `$${formatted}${suffix}`;
}

export function termLabel(commitmentMonths: number | null) {
  if (commitmentMonths == null || commitmentMonths <= 1) return "Month-to-month";
  return `${commitmentMonths}-month Term`;
}

export function findBaselinePlan(plans: MembershipPlanPublic[]): MembershipPlanPublic | null {
  return (
    plans.find((p) => p.commitment_months == null) ??
    plans.find((p) => p.commitment_months === 1) ??
    null
  );
}

export function computeMonthlySavingsPercent(
  plan: MembershipPlanPublic,
  baseline: MembershipPlanPublic | null,
): number | null {
  if (!baseline || baseline.public_id === plan.public_id) return null;
  if (baseline.price_cents <= 0) return null;
  const ratio = 1 - plan.price_cents / baseline.price_cents;
  if (ratio <= 0) return null;
  return Math.round(ratio * 100);
}

export function getLocationPriceChips(
  config: PublicMarketplaceConfig,
  location: MarketplaceLocationSummary,
) {
  const chips: Array<{ label: string; value: string }> = [];

  if (config.routeKey === "spaces") {
    if (location.starting_day_pass_price != null) {
      chips.push({ label: "Day Pass", value: formatUsd(location.starting_day_pass_price, "/day") });
    }
    if (location.starting_membership_price != null) {
      chips.push({ label: "Membership", value: formatUsd(location.starting_membership_price, "/mo") });
    }
  } else if (config.routeKey === "private-offices") {
    if (location.starting_monthly_price != null) {
      chips.push({ label: "Private Office", value: formatUsd(location.starting_monthly_price, "/mo") });
    }
  } else {
    if (location.starting_hourly_price != null) {
      chips.push({ label: "Hourly", value: formatUsd(location.starting_hourly_price, "/hr") });
    }
    if (location.starting_day_pass_price != null) {
      chips.push({ label: "Day Rate", value: formatUsd(location.starting_day_pass_price, "/day") });
    }
  }

  return chips;
}

export function getSpacePriceChips(
  config: PublicMarketplaceConfig,
  space: MarketplaceLocationSpace,
) {
  const chips: string[] = [];
  if (config.routeKey === "spaces") {
    if (space.price_daily != null) chips.push(`Day Pass ${formatUsd(space.price_daily, "/day")}`);
    if (space.membership_price != null) chips.push(`Membership $${space.membership_price}/mo`);
  } else if (config.routeKey === "private-offices") {
    if (space.price_monthly != null) chips.push(`Private Office ${formatUsd(space.price_monthly, "/mo")}`);
  } else {
    // Meeting rooms: lead with hourly (the new default), keep daily as the alt rate.
    if (space.hourly_price != null) {
      chips.push(`From ${formatUsd(space.hourly_price, "/hr")}`);
      if (space.price_daily != null) chips.push(`or ${formatUsd(space.price_daily, "/day")}`);
    } else if (space.price_daily != null) {
      chips.push(`Day Rate ${formatUsd(space.price_daily, "/day")}`);
    }
  }
  return chips;
}
