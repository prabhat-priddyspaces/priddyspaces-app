"use client";

import { useEffect, useRef, useState } from "react";

import { MarketplaceLocationSummary } from "@/lib/public-marketplace";

interface PublicMarketplaceMapProps {
  locations: MarketplaceLocationSummary[];
  selectedLocationId: string | null;
  onSelect: (locationId: string) => void;
}

type LeafletModule = typeof import("leaflet");
type MappableMarketplaceLocation = MarketplaceLocationSummary & { lat: number; lng: number };

function createMarkerHtml(count: number, selected: boolean, name: string) {
  return `
    <div data-location-name="${name}" class="${selected ? "public-map-pin public-map-pin--selected" : "public-map-pin"}">
      <span>${count}</span>
    </div>
  `;
}

export function PublicMarketplaceMap({
  locations,
  selectedLocationId,
  onSelect,
}: PublicMarketplaceMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerGroupRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mappableLocations = locations.filter(
    (location): location is MappableMarketplaceLocation => location.lat != null && location.lng != null,
  );
  const missingCoordinateCount = locations.length - mappableLocations.length;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !containerRef.current) {
        return;
      }
      leafletRef.current = leaflet;

      const map = leafletRef.current.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      });
      leafletRef.current
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          minZoom: 3,
          maxZoom: 18,
        })
        .addTo(map);
      map.setView([39.8283, -98.5795], 4);
      mapRef.current = map;
      setMapReady(true);
    })().catch(() => {
      // Leave the container empty if the map library fails to load.
    });

    return () => {
      cancelled = true;
      if (layerGroupRef.current && mapRef.current) {
        mapRef.current.removeLayer(layerGroupRef.current);
      }
      mapRef.current?.remove();
      layerGroupRef.current = null;
      mapRef.current = null;
      leafletRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!leaflet || !map || !mapReady) {
      return;
    }

    if (layerGroupRef.current) {
      map.removeLayer(layerGroupRef.current);
    }

    const markerLayerGroup = leaflet.layerGroup();

    const bounds: Array<[number, number]> = [];
    mappableLocations.forEach((location) => {
      const marker = leaflet.marker([location.lat, location.lng], {
        title: location.name,
        icon: leaflet.divIcon({
          className: "public-map-pin-wrapper",
          html: createMarkerHtml(
            location.matching_space_count,
            location.location_public_id === selectedLocationId,
            location.name,
          ),
          iconSize: [48, 48],
          iconAnchor: [24, 24],
        }),
      });
      marker.on("click", () => onSelect(location.location_public_id));
      markerLayerGroup.addLayer(marker);
      bounds.push([location.lat, location.lng]);
    });

    markerLayerGroup.addTo(map);
    layerGroupRef.current = markerLayerGroup;

    if (selectedLocationId) {
      const selected = locations.find((location) => location.location_public_id === selectedLocationId);
      if (selected) {
        if (selected.lat != null && selected.lng != null) {
          map.setView([selected.lat, selected.lng], Math.max(map.getZoom(), 11), { animate: true });
          return;
        }
      }
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 11, { animate: false });
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 11 });
    } else {
      map.setView([39.8283, -98.5795], 4, { animate: false });
    }
  }, [locations, mapReady, mappableLocations, onSelect, selectedLocationId]);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-sm">
      <div ref={containerRef} className="h-[380px] w-full lg:h-[calc(100vh-13rem)]" />
      {missingCoordinateCount > 0 ? (
        <div className="border-t border-line bg-surface px-4 py-3 text-xs text-text-2">
          {missingCoordinateCount} {missingCoordinateCount === 1 ? "location is" : "locations are"} listed without a map pin because latitude and longitude are missing.
        </div>
      ) : null}
    </div>
  );
}
