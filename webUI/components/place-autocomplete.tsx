"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

export interface PlaceDetails {
  formatted: string;
  street: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  neighborhood: string;
  lat: number | null;
  lng: number | null;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: PlaceDetails) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
}

let bootstrapPromise: Promise<void> | null = null;

function bootstrapGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { google?: { maps?: unknown } };
  if (w.google?.maps) return Promise.resolve();
  if (!bootstrapPromise) {
    bootstrapPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>("script[data-priddy-maps]");
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Google Maps script load failed")));
        return;
      }
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async`;
      script.async = true;
      script.defer = true;
      script.dataset.priddyMaps = "1";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Google Maps script load failed"));
      document.head.appendChild(script);
    });
  }
  return bootstrapPromise;
}

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

function pickComponent(components: AddressComponent[], type: string, short = false): string {
  const match = components.find((c) => c.types.includes(type));
  if (!match) return "";
  return short ? match.short_name : match.long_name;
}

function parsePlace(place: {
  address_components?: AddressComponent[];
  formatted_address?: string;
  geometry?: { location?: { lat: () => number; lng: () => number } };
}): PlaceDetails {
  const components = place.address_components || [];
  const streetNumber = pickComponent(components, "street_number");
  const route = pickComponent(components, "route");
  const street = [streetNumber, route].filter(Boolean).join(" ").trim();
  const city =
    pickComponent(components, "locality") ||
    pickComponent(components, "postal_town") ||
    pickComponent(components, "sublocality") ||
    pickComponent(components, "administrative_area_level_2");
  const state = pickComponent(components, "administrative_area_level_1", true);
  const country = pickComponent(components, "country");
  const postal_code = pickComponent(components, "postal_code");
  const neighborhood =
    pickComponent(components, "neighborhood") ||
    pickComponent(components, "sublocality_level_1");
  const loc = place.geometry?.location;
  return {
    formatted: place.formatted_address || street,
    street: street || place.formatted_address || "",
    city,
    state,
    country,
    postal_code,
    neighborhood,
    lat: loc ? loc.lat() : null,
    lng: loc ? loc.lng() : null,
  };
}

export function PlaceAutocomplete({ value, onChange, onSelect, id, placeholder, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!apiKey) {
      setWarning("Address autocomplete unavailable (no Google Maps API key configured). You can still type the address manually.");
      return;
    }
    if (!inputRef.current) return;

    type GoogleAutocomplete = {
      addListener: (event: string, handler: () => void) => { remove: () => void };
      getPlace: () => Parameters<typeof parsePlace>[0];
    };
    let autocomplete: GoogleAutocomplete | null = null;
    let listener: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        await bootstrapGoogleMaps(apiKey);
        const w = window as unknown as {
          google: {
            maps: {
              importLibrary: (name: string) => Promise<{
                Autocomplete: new (
                  input: HTMLInputElement,
                  options: { fields: string[]; types: string[] }
                ) => GoogleAutocomplete;
              }>;
            };
          };
        };
        const places = await w.google.maps.importLibrary("places");
        if (cancelled || !inputRef.current) return;
        autocomplete = new places.Autocomplete(inputRef.current, {
          fields: ["address_components", "formatted_address", "geometry"],
          types: ["address"],
        });
        listener = autocomplete.addListener("place_changed", () => {
          if (!autocomplete) return;
          const raw = autocomplete.getPlace();
          const parsed = parsePlace(raw);
          onSelect(parsed);
          if (parsed.formatted) onChange(parsed.formatted);
        });
      } catch (err) {
        if (!cancelled) {
          // Surface the underlying cause in the console — the UI just shows a generic notice.
          // eslint-disable-next-line no-console
          console.error("PlaceAutocomplete: failed to initialize Google Maps autocomplete", err);
          setWarning("Could not load Google Maps. Type the address manually.");
        }
      }
    })();

    return () => {
      cancelled = true;
      listener?.remove();
    };
    // We intentionally only set up Autocomplete once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  return (
    <div className="space-y-1">
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Start typing an address…"}
        disabled={disabled}
        autoComplete="off"
      />
      {warning && <p className="text-xs text-textSecondary">{warning}</p>}
    </div>
  );
}
