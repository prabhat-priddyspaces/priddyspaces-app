"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { CalendarDays, Clock3, Compass, Search, SlidersHorizontal, Users } from "lucide-react";

import { apiFetch } from "@/lib/api";
import {
  DEFAULT_RADIUS_MILES,
  MAX_RADIUS_MILES,
  PUBLIC_MARKETPLACE_CONFIGS,
  PUBLIC_MARKETPLACE_TABS,
  PublicMarketplaceRoute,
  buildApiSearchParams,
  buildMarketplaceSpaceHref,
  buildTabHref,
  formatLocationAddress,
  getLocationPriceChips,
  MarketplaceLocationSearchResponse,
} from "@/lib/public-marketplace";
import { PublicMarketplaceMap } from "@/components/public-marketplace-map";
import {
  PlaceDetails,
  reverseGeocode,
  useAddressAutocomplete,
} from "@/components/use-address-autocomplete";

interface PublicMarketplaceBrowserProps {
  routeKey: PublicMarketplaceRoute;
}

const DEFAULT_FORM = {
  q: "",
  date: "",
  start_time: "",
  end_time: "",
  capacity: "",
  max_price: "",
  max_price_monthly: "",
  sort: "",
  lat: "",
  lng: "",
  radius_miles: "",
};

export function PublicMarketplaceBrowser({ routeKey }: PublicMarketplaceBrowserProps) {
  const config = PUBLIC_MARKETPLACE_CONFIGS[routeKey];
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const currentSearchParams = new URLSearchParams(queryString);
  currentSearchParams.delete("amenities");
  const currentSearch = currentSearchParams.toString();

  const [form, setForm] = useState(DEFAULT_FORM);
  const [results, setResults] = useState<MarketplaceLocationSearchResponse["results"]>([]);
  const [totalLocations, setTotalLocations] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const autoLocateAttemptedRef = useRef(false);
  // The hook captures onSelect once; route through a ref so we can read the
  // latest form + search trigger without re-binding Autocomplete on every
  // render.
  const onPlaceSelectRef = useRef<(place: PlaceDetails) => void>(() => {});

  const { warning: autocompleteWarning } = useAddressAutocomplete(
    searchInputRef,
    (place) => onPlaceSelectRef.current(place),
    { types: ["geocode"] },
  );

  useEffect(() => {
    const next = new URLSearchParams(queryString);
    if (!next.has("amenities")) {
      return;
    }
    next.delete("amenities");
    const nextQuery = next.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, queryString, router]);

  useEffect(() => {
    const current = new URLSearchParams(queryString);
    setForm({
      q: current.get("q") || "",
      date: current.get("date") || "",
      start_time: current.get("start_time") || "",
      end_time: current.get("end_time") || "",
      capacity: current.get("capacity") || "",
      max_price: current.get("max_price") || "",
      max_price_monthly: current.get("max_price_monthly") || "",
      sort: current.get("sort") || "",
      lat: current.get("lat") || "",
      lng: current.get("lng") || "",
      radius_miles: current.get("radius_miles") || "",
    });
  }, [queryString]);

  useEffect(() => {
    const params = buildApiSearchParams(config, new URLSearchParams(queryString));
    setLoading(true);
    setError("");
    apiFetch<MarketplaceLocationSearchResponse>(`/api/marketplace/locations?${params.toString()}`, {
      method: "GET",
    })
      .then((response) => {
        setResults(response.results);
        setTotalLocations(response.meta.total_locations);
        setSelectedLocationId((current) =>
          response.results.some((result) => result.location_public_id === current)
            ? current
            : response.results[0]?.location_public_id || null
        );
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load marketplace locations");
        setResults([]);
        setTotalLocations(0);
        setSelectedLocationId(null);
      })
      .finally(() => setLoading(false));
  }, [config, queryString]);

  function updatePriceValue(value: string) {
    if (config.priceParamKey === "max_price_monthly") {
      setForm((current) => ({ ...current, max_price_monthly: value }));
      return;
    }
    setForm((current) => ({ ...current, max_price: value }));
  }

  function updateSearch(nextForm = form) {
    const params = new URLSearchParams();
    const entries: Array<[keyof typeof DEFAULT_FORM, string]> = [
      ["q", nextForm.q],
      ["date", nextForm.date],
      ["start_time", nextForm.start_time],
      ["end_time", nextForm.end_time],
      ["capacity", nextForm.capacity],
      ["sort", nextForm.sort],
      ["max_price", nextForm.max_price],
      ["max_price_monthly", nextForm.max_price_monthly],
    ];
    for (const [key, value] of entries) {
      const cleaned = value.trim();
      if (cleaned) {
        params.set(key, cleaned);
      }
    }
    const lat = nextForm.lat.trim();
    const lng = nextForm.lng.trim();
    if (lat && lng) {
      params.set("lat", lat);
      params.set("lng", lng);
      const radius = nextForm.radius_miles.trim();
      if (radius) {
        params.set("radius_miles", radius);
      }
    }
    const nextQuery = params.toString();
    router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateSearch();
  }

  // Keep the autocomplete callback fresh so it uses the latest form state.
  onPlaceSelectRef.current = (place: PlaceDetails) => {
    const next = [place.city, place.state].filter(Boolean).join(", ") || place.formatted;
    if (!next && place.lat == null) return;
    const radius = form.radius_miles.trim() || String(DEFAULT_RADIUS_MILES);
    const updated = {
      ...form,
      q: next,
      lat: place.lat != null ? String(place.lat) : "",
      lng: place.lng != null ? String(place.lng) : "",
      radius_miles: place.lat != null && place.lng != null ? radius : form.radius_miles,
    };
    setForm(updated);
    setLocationNotice(null);
    updateSearch(updated);
  };

  async function handleUseMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationNotice("Your browser doesn't support location services.");
      return;
    }
    setLocating(true);
    setLocationNotice(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 8000,
          maximumAge: 5 * 60 * 1000,
        });
      });
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const reverse = await reverseGeocode(lat, lng).catch(() => null);
      const label = reverse
        ? [reverse.city, reverse.state].filter(Boolean).join(", ") || reverse.formatted || ""
        : "";
      const radius = form.radius_miles.trim() || String(DEFAULT_RADIUS_MILES);
      const updated = {
        ...form,
        q: label,
        lat: String(lat),
        lng: String(lng),
        radius_miles: radius,
      };
      setForm(updated);
      updateSearch(updated);
    } catch (err: unknown) {
      const message =
        err instanceof GeolocationPositionError && err.code === err.PERMISSION_DENIED
          ? "Location permission denied. Search by city or ZIP instead."
          : "Couldn't get your location. Try searching by city or ZIP.";
      setLocationNotice(message);
    } finally {
      setLocating(false);
    }
  }

  // On first paint, if no location filter is set, try the browser geolocation
  // so users land on results near them with the default 50-mile radius.
  useEffect(() => {
    if (autoLocateAttemptedRef.current) return;
    autoLocateAttemptedRef.current = true;
    const current = new URLSearchParams(queryString);
    if (current.get("q") || current.get("lat")) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    void handleUseMyLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectLocation(locationId: string) {
    setSelectedLocationId(locationId);
    const node = cardRefs.current[locationId];
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  const activeLocation = results.find((result) => result.location_public_id === selectedLocationId) || null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.14),_transparent_34%),linear-gradient(180deg,_#f8fafc_0%,_#eef6f8_100%)] pb-10">
      <div className="border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-700">Priddyspaces</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">Public Marketplace</div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Join Now
            </Link>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-[1440px] px-6 pt-8">
        <div className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.35)]">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{config.title}</h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">{config.subtitle}</p>
              </div>
              {activeLocation ? (
                <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
                  <div className="font-semibold">{activeLocation.name}</div>
                  <div className="mt-1 text-xs text-teal-700">{formatLocationAddress(activeLocation)}</div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
              {PUBLIC_MARKETPLACE_TABS.map((tab) => {
                const active = tab.routeKey === routeKey;
                return (
                  <Link
                    key={tab.routeKey}
                    href={buildTabHref(tab.routeKey, searchParams)}
                    className={
                      active
                        ? "rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                        : "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                    }
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>

            <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,0.8fr))_auto]">
              <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
                <Search className="h-4 w-4 text-slate-500" />
                <input
                  ref={searchInputRef}
                  value={form.q}
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm((current) => ({
                      ...current,
                      q: value,
                      // Free-text edits invalidate any geocoded coordinates; clear
                      // them so the next search uses keyword matching.
                      lat: "",
                      lng: "",
                    }));
                  }}
                  placeholder={config.queryPlaceholder}
                  autoComplete="off"
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={locating}
                  title="Use my current location"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-teal-500 hover:text-teal-700 disabled:cursor-wait disabled:opacity-60"
                >
                  <Compass className="h-3.5 w-3.5" />
                  {locating ? "Locating…" : "Use my location"}
                </button>
              </label>
              {routeKey !== "private-offices" ? (
                <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  <input
                    type="date"
                    value={form.date}
                    onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                    className="w-full bg-transparent text-sm text-slate-900 outline-none"
                  />
                </label>
              ) : (
                <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
                  <Users className="h-4 w-4 text-slate-500" />
                  <input
                    type="number"
                    min="1"
                    value={form.capacity}
                    onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
                    placeholder="Min capacity"
                    className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                  />
                </label>
              )}
              {routeKey === "meeting-rooms" ? (
                <>
                  <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
                    <Clock3 className="h-4 w-4 text-slate-500" />
                    <input
                      type="time"
                      value={form.start_time}
                      onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))}
                      className="w-full bg-transparent text-sm text-slate-900 outline-none"
                    />
                  </label>
                  <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
                    <Clock3 className="h-4 w-4 text-slate-500" />
                    <input
                      type="time"
                      value={form.end_time}
                      onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))}
                      className="w-full bg-transparent text-sm text-slate-900 outline-none"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
                    <Users className="h-4 w-4 text-slate-500" />
                    <input
                      type="number"
                      min="1"
                      value={form.capacity}
                      onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
                      placeholder="Min capacity"
                      className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                    />
                  </label>
                  <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
                    <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                    <input
                    type="number"
                    min="0"
                    value={config.priceParamKey === "max_price_monthly" ? form.max_price_monthly : form.max_price}
                    onChange={(event) => updatePriceValue(event.target.value)}
                    placeholder={config.priceLabel}
                    className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                  />
                  </label>
                </>
              )}
              {routeKey === "meeting-rooms" ? (
                <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
                  <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                  <input
                    type="number"
                    min="0"
                    value={form.max_price}
                    onChange={(event) => setForm((current) => ({ ...current, max_price: event.target.value }))}
                    placeholder={config.priceLabel}
                    className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                  />
                </label>
              ) : null}
              <button
                type="submit"
                className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Search
              </button>
            </form>
            {autocompleteWarning && (
              <p className="text-xs text-slate-500">{autocompleteWarning}</p>
            )}
            {locationNotice && (
              <p className="text-xs text-slate-500">{locationNotice}</p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 md:max-w-[280px]">
                <Compass className="h-4 w-4 text-slate-500" />
                <span className="whitespace-nowrap text-xs uppercase tracking-[0.16em] text-slate-500">Within</span>
                <input
                  type="number"
                  min="1"
                  max={MAX_RADIUS_MILES}
                  step="1"
                  value={form.radius_miles}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") {
                      setForm((current) => ({ ...current, radius_miles: "" }));
                      return;
                    }
                    const parsed = Number(raw);
                    if (Number.isNaN(parsed)) return;
                    const clamped = Math.max(1, Math.min(MAX_RADIUS_MILES, Math.floor(parsed)));
                    setForm((current) => ({ ...current, radius_miles: String(clamped) }));
                  }}
                  placeholder={String(DEFAULT_RADIUS_MILES)}
                  disabled={!form.lat || !form.lng}
                  className="w-16 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <span className="whitespace-nowrap text-xs text-slate-500">miles</span>
                {!form.lat || !form.lng ? (
                  <span className="ml-auto text-[11px] text-slate-400">Pick a place to enable</span>
                ) : null}
              </label>
              <select
                value={form.sort}
                onChange={(event) => setForm((current) => ({ ...current, sort: event.target.value }))}
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none md:max-w-[220px]"
              >
                <option value="">Default sort</option>
                <option value="relevance">Relevance</option>
                <option value="distance">Distance</option>
                <option value="price_asc">Lowest price</option>
                <option value="price_desc">Highest price</option>
                <option value="name">Location name</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-6 pt-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Showing {totalLocations} locations</div>
                <div className="text-xs text-slate-500">Results stay in the URL, so you can refresh or share this search.</div>
              </div>
            </div>

            {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            {loading ? <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-sm text-slate-500">Loading marketplace locations…</div> : null}
            {!loading && results.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-sm text-slate-500">
                No locations matched this search. Try widening the price cap or removing a date or capacity filter.
              </div>
            ) : null}

            {results.map((location) => {
              const chips = getLocationPriceChips(config, location);
              const active = location.location_public_id === selectedLocationId;
              const locationHref = currentSearch
                ? `${pathname}/${location.location_public_id}?${currentSearch}`
                : `${pathname}/${location.location_public_id}`;
              const primaryHref = location.featured_space_public_id
                ? buildMarketplaceSpaceHref(location.featured_space_public_id, routeKey, currentSearch)
                : locationHref;

              function handleCardActivate() {
                handleSelectLocation(location.location_public_id);
                router.push(primaryHref);
              }

              return (
                <div
                  key={location.location_public_id}
                  ref={(node) => {
                    cardRefs.current[location.location_public_id] = node;
                  }}
                  data-selected={active ? "true" : "false"}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open ${location.name}`}
                  onMouseEnter={() => handleSelectLocation(location.location_public_id)}
                  onFocus={() => handleSelectLocation(location.location_public_id)}
                  onClick={handleCardActivate}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleCardActivate();
                    }
                  }}
                  className={
                    active
                      ? "cursor-pointer rounded-[28px] border border-teal-300 bg-white p-4 shadow-[0_20px_50px_-30px_rgba(15,118,110,0.5)] outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-teal-600"
                      : "cursor-pointer rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                  }
                >
                  <div className="flex gap-4">
                    <div className="h-36 w-36 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                      {location.featured_image_url ? (
                        <img
                          src={location.featured_image_url}
                          alt={location.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,_#d1fae5,_#e2e8f0)] text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
                          Priddyspaces
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-2xl font-semibold text-slate-900">{location.name}</h2>
                          <p className="mt-1 text-sm text-slate-600">{formatLocationAddress(location)}</p>
                          {location.neighborhood ? (
                            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-teal-700">{location.neighborhood}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {location.distance_miles != null ? (
                            <div className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                              {location.distance_miles < 0.1
                                ? "<0.1 mi"
                                : `${location.distance_miles.toFixed(1)} mi`}
                            </div>
                          ) : null}
                          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {location.matching_space_count} matching {location.matching_space_count === 1 ? "space" : "spaces"}
                          </div>
                        </div>
                      </div>

                      {location.location_amenities.length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {location.location_amenities.slice(0, 6).map((amenity) => (
                            <span
                              key={amenity}
                              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
                            >
                              {amenity}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {chips.length > 0 ? (
                        <div className="mt-5 flex flex-wrap gap-2">
                          {chips.map((chip) => (
                            <div
                              key={`${location.location_public_id}-${chip.label}`}
                              className="rounded-full border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900"
                            >
                              <span className="mr-2 text-teal-700">{chip.label}</span>
                              {chip.value}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-5 flex flex-wrap gap-3">
                        <Link
                          href={primaryHref}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                        >
                          Open listing
                        </Link>
                        <Link
                          href={locationHref}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
                        >
                          View location
                        </Link>
                        {location.featured_space_public_id ? (
                          <Link
                            href={primaryHref}
                            onClick={(event) => event.stopPropagation()}
                            className="text-sm font-medium text-teal-700 transition hover:text-teal-900"
                          >
                            Featured space
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="lg:sticky lg:top-6 lg:self-start">
            <PublicMarketplaceMap
              locations={results}
              selectedLocationId={selectedLocationId}
              onSelect={handleSelectLocation}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
