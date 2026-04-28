"use client";

import dynamic from "next/dynamic";

import { isGoogleMapsConfigured } from "@/lib/google-maps-loader";
import { MarketplaceLocationSummary } from "@/lib/public-marketplace";

interface PublicMarketplaceMapProps {
  locations: MarketplaceLocationSummary[];
  selectedLocationId: string | null;
  onSelect: (locationId: string) => void;
}

const GoogleImpl = dynamic(
  () => import("./public-marketplace-map.google").then((m) => m.PublicMarketplaceMap),
  { ssr: false },
);

const LeafletImpl = dynamic(
  () => import("./public-marketplace-map.leaflet").then((m) => m.PublicMarketplaceMap),
  { ssr: false },
);

export function PublicMarketplaceMap(props: PublicMarketplaceMapProps) {
  const Impl = isGoogleMapsConfigured() ? GoogleImpl : LeafletImpl;
  return <Impl {...props} />;
}
