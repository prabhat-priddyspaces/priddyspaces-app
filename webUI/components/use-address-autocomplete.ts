"use client";

import { RefObject, useEffect, useState } from "react";

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

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

let mapsPromise: Promise<void> | null = null;

function loadMapsWithPlaces(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { google?: { maps?: { places?: unknown } } };
  if (w.google?.maps?.places) return Promise.resolve();
  if (!mapsPromise) {
    mapsPromise = new Promise((resolve, reject) => {
      const callbackName = `__priddyMapsReady_${Math.random().toString(36).slice(2)}`;
      (window as unknown as Record<string, () => void>)[callbackName] = () => {
        delete (window as unknown as Record<string, () => void>)[callbackName];
        resolve();
      };
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=places&callback=${callbackName}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        delete (window as unknown as Record<string, () => void>)[callbackName];
        mapsPromise = null;
        reject(new Error("Google Maps script failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return mapsPromise;
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

interface AutocompleteOptions {
  /** Restrict to specific Google place types. Defaults to street addresses. */
  types?: string[];
}

export interface UseAddressAutocompleteResult {
  /**
   * Notice to surface in the UI when autocomplete can't load. `null` when
   * everything is wired up cleanly.
   */
  warning: string | null;
}

/**
 * Attach Google Places Autocomplete to an existing input element.
 *
 * Loads the Maps JS SDK on demand (once per page), constructs an
 * Autocomplete on the referenced input, and forwards parsed place details
 * to `onSelect` whenever the user picks a suggestion.
 */
export function useAddressAutocomplete(
  inputRef: RefObject<HTMLInputElement | null>,
  onSelect: (place: PlaceDetails) => void,
  options: AutocompleteOptions = {},
): UseAddressAutocompleteResult {
  const [warning, setWarning] = useState<string | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const types = options.types ?? ["address"];

  useEffect(() => {
    if (!apiKey) {
      setWarning(
        "Address autocomplete unavailable (no Google Maps API key configured). You can still type the address manually.",
      );
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
        await loadMapsWithPlaces(apiKey);
        const w = window as unknown as {
          google: {
            maps: {
              places: {
                Autocomplete: new (
                  input: HTMLInputElement,
                  opts: { fields: string[]; types: string[] },
                ) => GoogleAutocomplete;
              };
            };
          };
        };
        if (cancelled || !inputRef.current) return;
        autocomplete = new w.google.maps.places.Autocomplete(inputRef.current, {
          fields: ["address_components", "formatted_address", "geometry"],
          types,
        });
        listener = autocomplete.addListener("place_changed", () => {
          if (!autocomplete) return;
          onSelect(parsePlace(autocomplete.getPlace()));
        });
      } catch (err) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.error("useAddressAutocomplete: failed to initialize Google Maps autocomplete", err);
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

  return { warning };
}
