import { formatUsd } from "@/lib/money";
import { markLeaseEstimate, type MarketplaceSpaceDetailSpace } from "@/lib/public-marketplace";
import { formatCents } from "@/lib/loyalty";

/** Pure helpers extracted from public-space-detail-view.tsx (behaviour unchanged). */

export interface PriceRow {
  label: string;
  value: string;
}

export function getPriceRows(space: MarketplaceSpaceDetailSpace): PriceRow[] {
  const rows: PriceRow[] = [];
  const productPrices = space.booking_products ?? [];
  const firstPlan = productPrices
    .filter((product) => product.price_cents != null)
    .sort((a, b) => (a.price_cents ?? 0) - (b.price_cents ?? 0))[0];

  if (space.space_type === "conference_room") {
    if (space.hourly_price != null) rows.push({ label: "Hourly", value: formatUsd(space.hourly_price, "/hour") });
    if (space.price_daily != null) rows.push({ label: "Day Rate", value: formatUsd(space.price_daily, "/day") });
    return rows;
  }
  if (space.space_type === "shared_desk") {
    if (space.price_daily != null) rows.push({ label: "Day Pass", value: formatUsd(space.price_daily, "/day") });
    if (space.membership_price != null) rows.push({ label: "Membership", value: formatUsd(space.membership_price, "/month") });
    return rows;
  }
  if (space.space_type === "virtual_office") {
    if (space.membership_price != null) rows.push({ label: "Virtual Membership", value: formatUsd(space.membership_price, "/month") });
    return rows;
  }
  if (firstPlan?.price_cents != null) {
    rows.push({
      label: "Lease",
      value: markLeaseEstimate(formatCents(firstPlan.price_cents) + "/month"),
    });
  } else if (space.membership_price != null) {
    rows.push({
      label: "Lease",
      value: markLeaseEstimate(formatUsd(space.membership_price, "/month")),
    });
  }
  return rows;
}

export function buildDirectionsHref(address: string, lat: number | null, lng: number | null): string {
  const query = lat != null && lng != null ? `${lat},${lng}` : address;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function buildInitials(name: string): string {
  const parts = name.split(" ").filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "VX";
}

export function membershipBookingModeForSpaceType(spaceType: string): string | null {
  if (spaceType === "shared_desk") return "monthly_membership";
  if (spaceType === "virtual_office") return "virtual_membership";
  return null;
}
