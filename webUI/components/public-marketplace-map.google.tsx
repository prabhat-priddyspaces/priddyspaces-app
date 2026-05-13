"use client";

import { useEffect, useRef, useState } from "react";

import { getGoogleMapsApiKey, getGoogleMapsMapId, loadGoogleMaps } from "@/lib/google-maps-loader";
import { MarketplaceLocationSummary } from "@/lib/public-marketplace";

interface PublicMarketplaceMapProps {
  locations: MarketplaceLocationSummary[];
  selectedLocationId: string | null;
  onSelect: (locationId: string) => void;
}

type MappableMarketplaceLocation = MarketplaceLocationSummary & { lat: number; lng: number };

interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface GMap {
  setCenter: (center: LatLngLiteral) => void;
  setZoom: (zoom: number) => void;
  getZoom: () => number | undefined;
  panTo: (center: LatLngLiteral) => void;
  fitBounds: (bounds: GLatLngBounds, padding?: number) => void;
}

interface GLatLngBounds {
  extend: (latlng: LatLngLiteral) => void;
}

interface GAdvancedMarker {
  map: GMap | null;
  addListener: (event: string, handler: () => void) => { remove: () => void };
}

interface GoogleNamespace {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
    LatLngBounds: new () => GLatLngBounds;
    marker: {
      AdvancedMarkerElement: new (opts: {
        map: GMap;
        position: LatLngLiteral;
        title?: string;
        content?: HTMLElement;
      }) => GAdvancedMarker;
    };
    event: {
      addListenerOnce: (instance: object, event: string, handler: () => void) => { remove: () => void };
    };
  };
}

function createMarkerContent(count: number, selected: boolean, name: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "public-map-pin-wrapper";
  const pin = document.createElement("div");
  pin.className = selected ? "public-map-pin public-map-pin--selected" : "public-map-pin";
  pin.dataset.locationName = name;
  const span = document.createElement("span");
  span.textContent = String(count);
  pin.appendChild(span);
  wrapper.appendChild(pin);
  return wrapper;
}

export function PublicMarketplaceMap({
  locations,
  selectedLocationId,
  onSelect,
}: PublicMarketplaceMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const googleRef = useRef<GoogleNamespace | null>(null);
  const mapRef = useRef<GMap | null>(null);
  const markersRef = useRef<GAdvancedMarker[]>([]);
  const listenersRef = useRef<Array<{ remove: () => void }>>([]);
  const [mapReady, setMapReady] = useState(false);

  const mappableLocations = locations.filter(
    (location): location is MappableMarketplaceLocation => location.lat != null && location.lng != null,
  );
  const missingCoordinateCount = locations.length - mappableLocations.length;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) return;

    let cancelled = false;
    (async () => {
      try {
        await loadGoogleMaps(apiKey);
        if (cancelled || !containerRef.current) return;
        const g = (window as unknown as { google: GoogleNamespace }).google;
        googleRef.current = g;
        const map = new g.maps.Map(containerRef.current, {
          center: { lat: 39.8283, lng: -98.5795 },
          zoom: 4,
          mapId: getGoogleMapsMapId(),
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapRef.current = map;
        setMapReady(true);
      } catch {
        // Leave the container empty if Google Maps fails to load.
      }
    })();

    return () => {
      cancelled = true;
      listenersRef.current.forEach((l) => l.remove());
      listenersRef.current = [];
      markersRef.current.forEach((marker) => {
        marker.map = null;
      });
      markersRef.current = [];
      mapRef.current = null;
      googleRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const g = googleRef.current;
    const map = mapRef.current;
    if (!g || !map || !mapReady) return;

    listenersRef.current.forEach((l) => l.remove());
    listenersRef.current = [];
    markersRef.current.forEach((marker) => {
      marker.map = null;
    });
    markersRef.current = [];

    const bounds = new g.maps.LatLngBounds();
    mappableLocations.forEach((location) => {
      const marker = new g.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: location.lat, lng: location.lng },
        title: location.name,
        content: createMarkerContent(
          location.matching_space_count,
          location.location_public_id === selectedLocationId,
          location.name,
        ),
      });
      const listener = marker.addListener("click", () => onSelect(location.location_public_id));
      listenersRef.current.push(listener);
      markersRef.current.push(marker);
      bounds.extend({ lat: location.lat, lng: location.lng });
    });

    if (selectedLocationId) {
      const selected = locations.find((location) => location.location_public_id === selectedLocationId);
      if (selected && selected.lat != null && selected.lng != null) {
        map.panTo({ lat: selected.lat, lng: selected.lng });
        if ((map.getZoom() ?? 0) < 11) {
          map.setZoom(11);
        }
        return;
      }
    }

    if (mappableLocations.length === 1) {
      const only = mappableLocations[0];
      map.setCenter({ lat: only.lat, lng: only.lng });
      map.setZoom(11);
    } else if (mappableLocations.length > 1) {
      map.fitBounds(bounds, 32);
      const capListener = g.maps.event.addListenerOnce(map, "bounds_changed", () => {
        if ((map.getZoom() ?? 0) > 11) map.setZoom(11);
      });
      listenersRef.current.push(capListener);
    } else {
      map.setCenter({ lat: 39.8283, lng: -98.5795 });
      map.setZoom(4);
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
