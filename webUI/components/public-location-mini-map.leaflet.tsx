"use client";

import { useEffect, useRef } from "react";

interface PublicLocationMiniMapProps {
  lat: number | null;
  lng: number | null;
  name: string;
}

type LeafletModule = typeof import("leaflet");

function createMarkerHtml(name: string) {
  return `
    <div class="public-map-pin public-map-pin--selected" data-location-name="${name}">
      <span>1</span>
    </div>
  `;
}

export function PublicLocationMiniMap({ lat, lng, name }: PublicLocationMiniMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || lat == null || lng == null) {
      return;
    }

    let cancelled = false;
    import("leaflet").then((leaflet) => {
      if (cancelled || !containerRef.current) {
        return;
      }

      leafletRef.current = leaflet;
      const map = leaflet.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        dragging: true,
        scrollWheelZoom: false,
      });
      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          minZoom: 3,
          maxZoom: 18,
        })
        .addTo(map);
      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      mapRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
      leafletRef.current = null;
    };
  }, [lat, lng]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!leaflet || !map || lat == null || lng == null) {
      return;
    }

    markerRef.current?.remove();
    markerRef.current = leaflet.marker([lat, lng], {
      title: name,
      icon: leaflet.divIcon({
        className: "public-map-pin-wrapper",
        html: createMarkerHtml(name),
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      }),
    });
    markerRef.current.addTo(map);
    map.setView([lat, lng], 13, { animate: false });
  }, [lat, lng, name]);

  if (lat == null || lng == null) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border border-line bg-surface-2 px-4 text-sm text-text-3">
        Map is unavailable for this location.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-2">
      <div ref={containerRef} className="h-56 w-full" />
    </div>
  );
}
