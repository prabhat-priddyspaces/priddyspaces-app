"use client";

import { useEffect, useRef } from "react";

import { getGoogleMapsApiKey, getGoogleMapsMapId, loadGoogleMaps } from "@/lib/google-maps-loader";

interface PublicLocationMiniMapProps {
  lat: number | null;
  lng: number | null;
  name: string;
}

interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface GMap {
  setCenter: (center: LatLngLiteral) => void;
  setZoom: (zoom: number) => void;
}

interface GAdvancedMarker {
  map: GMap | null;
}

interface GoogleNamespace {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
    marker: {
      AdvancedMarkerElement: new (opts: {
        map: GMap;
        position: LatLngLiteral;
        title?: string;
        content?: HTMLElement;
      }) => GAdvancedMarker;
    };
  };
}

function createMarkerContent(name: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "public-map-pin-wrapper";
  const pin = document.createElement("div");
  pin.className = "public-map-pin public-map-pin--selected";
  pin.dataset.locationName = name;
  const span = document.createElement("span");
  span.textContent = "1";
  pin.appendChild(span);
  wrapper.appendChild(pin);
  return wrapper;
}

export function PublicLocationMiniMap({ lat, lng, name }: PublicLocationMiniMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const googleRef = useRef<GoogleNamespace | null>(null);
  const mapRef = useRef<GMap | null>(null);
  const markerRef = useRef<GAdvancedMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || lat == null || lng == null) {
      return;
    }
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
          center: { lat, lng },
          zoom: 13,
          mapId: getGoogleMapsMapId(),
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: false,
          gestureHandling: "cooperative",
        });
        mapRef.current = map;
      } catch {
        // Leave the container empty if Google Maps fails to load.
      }
    })();

    return () => {
      cancelled = true;
      if (markerRef.current) markerRef.current.map = null;
      markerRef.current = null;
      mapRef.current = null;
      googleRef.current = null;
    };
  }, [lat, lng]);

  useEffect(() => {
    const g = googleRef.current;
    const map = mapRef.current;
    if (!g || !map || lat == null || lng == null) return;

    if (markerRef.current) markerRef.current.map = null;
    markerRef.current = new g.maps.marker.AdvancedMarkerElement({
      map,
      position: { lat, lng },
      title: name,
      content: createMarkerContent(name),
    });
    map.setCenter({ lat, lng });
    map.setZoom(13);
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
