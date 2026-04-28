"use client";

import dynamic from "next/dynamic";

import { isGoogleMapsConfigured } from "@/lib/google-maps-loader";

interface PublicLocationMiniMapProps {
  lat: number | null;
  lng: number | null;
  name: string;
}

const GoogleImpl = dynamic(
  () => import("./public-location-mini-map.google").then((m) => m.PublicLocationMiniMap),
  { ssr: false },
);

const LeafletImpl = dynamic(
  () => import("./public-location-mini-map.leaflet").then((m) => m.PublicLocationMiniMap),
  { ssr: false },
);

export function PublicLocationMiniMap(props: PublicLocationMiniMapProps) {
  const Impl = isGoogleMapsConfigured() ? GoogleImpl : LeafletImpl;
  return <Impl {...props} />;
}
