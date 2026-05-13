"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Building2,
  Calendar as CalendarIcon,
  ChevronDown,
  Clock3,
  Compass,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
} from "lucide-react";

import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PublicTopbar } from "@/components/public-topbar";
import { PublicImageWithFallback } from "@/components/public-image-with-fallback";
import {
  DEFAULT_RADIUS_MILES,
  MAX_RADIUS_MILES,
  PUBLIC_MARKETPLACE_CONFIGS,
  PUBLIC_MARKETPLACE_TABS,
  PublicMarketplaceRoute,
  buildApiSearchParams,
  buildMarketplaceLocationHref,
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
import { cn } from "@/lib/utils";

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

// Sub-label for each marketplace tab — matches the prototype's
// "Coworking · Day passes" two-line pill, rendered without changing the
// canonical tab `label` (which the e2e suite asserts on).
const TAB_SUBLABELS: Record<PublicMarketplaceRoute, string> = {
  spaces: "Day passes",
  "meeting-rooms": "Hourly",
  "private-offices": "Monthly",
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

  return (
    <main className="min-h-screen bg-bg text-text">
      <PublicTopbar />

      <section className="mx-auto max-w-[1440px] px-6 pt-6 lg:pt-8">
        <div className="flex flex-col gap-1.5 mb-4">
          <h1 className="text-[28px] lg:text-[32px] font-semibold tracking-[-0.02em] text-text">
            {config.title}
          </h1>
          <p className="text-[13px] text-text-3 max-w-2xl">{config.subtitle}</p>
        </div>

        {/* Tab pills — labels are the canonical PUBLIC_MARKETPLACE_TABS values
            (so the e2e role-by-name lookups still match). Sub-labels add the
            prototype's two-line treatment. */}
        <div className="flex flex-wrap gap-2 mb-3.5">
          {PUBLIC_MARKETPLACE_TABS.map((tab) => {
            const active = tab.routeKey === routeKey;
            return (
              <Link
                key={tab.routeKey}
                href={buildTabHref(tab.routeKey, searchParams)}
                className={cn(
                  "flex flex-col items-start gap-0 px-4 py-2 rounded-xl border text-left transition-colors",
                  active
                    ? "bg-brand text-white border-brand shadow-sm"
                    : "bg-surface text-text-2 border-line hover:border-line-strong"
                )}
              >
                <span className="text-[13px] font-semibold leading-tight">
                  {tab.label}
                </span>
                <span
                  className={cn(
                    "text-[11px] leading-tight mt-0.5",
                    active ? "text-white/80" : "text-text-3"
                  )}
                >
                  {TAB_SUBLABELS[tab.routeKey]}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Search bar — divided horizontal card */}
        <Card padded={false} className="overflow-hidden mb-3">
          <form
            onSubmit={handleSubmit}
            className="grid gap-0 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] divide-y lg:divide-y-0 lg:divide-x divide-line"
          >
            <SearchField
              icon={<MapPin size={13} className="text-brand" />}
              label="Where"
            >
              <div className="flex items-center gap-2">
                <input
                  ref={searchInputRef}
                  value={form.q}
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm((current) => ({
                      ...current,
                      q: value,
                      // Free-text edits invalidate any geocoded coordinates.
                      lat: "",
                      lng: "",
                    }));
                  }}
                  placeholder={config.queryPlaceholder}
                  autoComplete="off"
                  className="flex-1 min-w-0 bg-transparent text-[13px] font-medium text-text outline-none placeholder:text-text-4"
                />
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={locating}
                  title="Use my current location"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-3 transition hover:border-brand hover:text-brand disabled:cursor-wait disabled:opacity-60"
                >
                  <Compass className="h-3 w-3" />
                  {locating ? "Locating…" : "Locate me"}
                </button>
              </div>
            </SearchField>

            {routeKey !== "private-offices" ? (
              <SearchField
                icon={<CalendarIcon size={13} className="text-text-3" />}
                label="When"
              >
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                  className="bg-transparent text-[13px] font-medium text-text outline-none w-full"
                />
              </SearchField>
            ) : (
              <SearchField
                icon={<Users size={13} className="text-text-3" />}
                label="Capacity"
              >
                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
                  placeholder="Min capacity"
                  className="bg-transparent text-[13px] font-medium text-text outline-none w-full placeholder:text-text-4"
                />
              </SearchField>
            )}

            {routeKey === "meeting-rooms" ? (
              <>
                <SearchField
                  icon={<Clock3 size={13} className="text-text-3" />}
                  label="Start"
                >
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))}
                    className="bg-transparent text-[13px] font-medium text-text outline-none w-full"
                  />
                </SearchField>
                <SearchField
                  icon={<Clock3 size={13} className="text-text-3" />}
                  label="End"
                >
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))}
                    className="bg-transparent text-[13px] font-medium text-text outline-none w-full"
                  />
                </SearchField>
              </>
            ) : (
              <>
                <SearchField
                  icon={<Users size={13} className="text-text-3" />}
                  label="Capacity"
                >
                  <input
                    type="number"
                    min="1"
                    value={form.capacity}
                    onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
                    placeholder="Min capacity"
                    className="bg-transparent text-[13px] font-medium text-text outline-none w-full placeholder:text-text-4"
                  />
                </SearchField>
                <SearchField
                  icon={<SlidersHorizontal size={13} className="text-text-3" />}
                  label={config.priceLabel}
                >
                  <input
                    type="number"
                    min="0"
                    value={
                      config.priceParamKey === "max_price_monthly"
                        ? form.max_price_monthly
                        : form.max_price
                    }
                    onChange={(event) => updatePriceValue(event.target.value)}
                    placeholder="Any"
                    className="bg-transparent text-[13px] font-medium text-text outline-none w-full placeholder:text-text-4"
                  />
                </SearchField>
              </>
            )}

            <div className="p-2 flex items-stretch">
              <button
                type="submit"
                className="inline-flex h-11 lg:h-auto items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[14px] font-semibold text-white transition hover:bg-brand-hover lg:min-w-[120px]"
              >
                <Search size={14} strokeWidth={2.5} />
                Search
              </button>
            </div>
          </form>
        </Card>

        {/* Helper / radius / sort row */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 h-9 text-[12px] text-text-3">
            <Compass className="h-3.5 w-3.5" />
            <span className="uppercase tracking-[0.06em] text-[10px] text-text-3 font-semibold">Within</span>
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
              className="w-12 bg-transparent text-text outline-none placeholder:text-text-4 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <span className="text-[12px] text-text-3">mi</span>
            {!form.lat || !form.lng ? (
              <span className="text-[10px] text-text-4">Pick a place</span>
            ) : null}
          </label>
          <div className="relative">
            <select
              value={form.sort}
              onChange={(event) => setForm((current) => ({ ...current, sort: event.target.value }))}
              className="h-9 appearance-none rounded-xl border border-line bg-surface pl-3 pr-8 text-[13px] text-text outline-none"
            >
              <option value="">Default sort</option>
              <option value="relevance">Relevance</option>
              <option value="distance">Distance</option>
              <option value="price_asc">Lowest price</option>
              <option value="price_desc">Highest price</option>
              <option value="name">Location name</option>
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3"
            />
          </div>
          {autocompleteWarning && (
            <p className="text-[11px] text-text-4">{autocompleteWarning}</p>
          )}
          {locationNotice && (
            <p className="text-[11px] text-text-4">{locationNotice}</p>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-6 pb-12">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
          <div className="space-y-3.5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[14px] text-text-2">
                  <strong className="text-text">Showing {totalLocations} locations</strong>
                </div>
                <div className="text-[11px] text-text-3 mt-0.5">
                  Results stay in the URL, so you can refresh or share this search.
                </div>
              </div>
            </div>

            {error ? (
              <Card padded={false} className="px-4 py-3 border-danger/30 bg-danger-soft text-[13px] text-danger">
                {error}
              </Card>
            ) : null}
            {loading ? (
              <Card padded={false} className="px-4 py-12 text-[13px] text-text-3 text-center">
                Loading marketplace locations…
              </Card>
            ) : null}
            {!loading && results.length === 0 ? (
              <Card padded={false} className="px-4 py-12 text-[13px] text-text-3 text-center">
                No locations matched this search. Try widening the price cap or removing a date or capacity filter.
              </Card>
            ) : null}

            {results.map((location, index) => {
              const chips = getLocationPriceChips(config, location);
              const active = location.location_public_id === selectedLocationId;
              const locationHref = buildMarketplaceLocationHref(
                routeKey,
                location.location_public_id,
                currentSearch,
              );
              const primaryHref = location.featured_space_public_id
                ? buildMarketplaceSpaceHref(location.featured_space_public_id, routeKey, currentSearch)
                : locationHref;
              const featured = index === 0;

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
                  className={cn(
                    "rounded-2xl bg-surface border p-3 cursor-pointer transition-all outline-none focus-visible:shadow-ring",
                    active
                      ? "border-brand"
                      : "border-line hover:border-line-strong shadow-xs dark:shadow-none"
                  )}
                  style={
                    active
                      ? { boxShadow: "0 0 0 3px var(--brand-soft)" }
                      : undefined
                  }
                >
                  <div className="flex gap-3">
                    <div
                      className="relative w-32 h-28 rounded-xl overflow-hidden flex-none"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--ps-violet-100), var(--ps-mint-100))",
                      }}
                    >
                      <PublicImageWithFallback
                        src={location.featured_image_url}
                        alt={location.name}
                        className="h-full w-full object-cover"
                        fallbackClassName="absolute inset-0 grid place-items-center text-brand opacity-50"
                      />
                      {featured ? (
                        <Badge
                          variant="violet"
                          className="absolute top-2 right-2 h-[18px] text-[10px] px-1.5 bg-brand text-white"
                        >
                          <Sparkles size={10} strokeWidth={2.5} />
                          Featured
                        </Badge>
                      ) : null}
                      {!location.featured_image_url ? (
                        <div className="absolute inset-0 grid place-items-center text-brand opacity-40 pointer-events-none">
                          <Building2 size={28} />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h2 className="text-[15px] font-semibold tracking-[-0.01em] truncate">
                              {location.name}
                            </h2>
                            <div className="text-[11px] text-text-3 mt-0.5 truncate">
                              {formatLocationAddress(location)}
                            </div>
                          </div>
                          {location.distance_miles != null ? (
                            <Badge variant="default" className="shrink-0">
                              {location.distance_miles < 0.1
                                ? "<0.1 mi"
                                : `${location.distance_miles.toFixed(1)} mi`}
                            </Badge>
                          ) : null}
                        </div>
                        {location.location_amenities.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {location.location_amenities.slice(0, 5).map((amenity) => (
                              <span
                                key={amenity}
                                className="inline-flex items-center h-[20px] px-1.5 text-[10px] font-medium rounded-full bg-surface-2 text-text-3"
                              >
                                {amenity}
                              </span>
                            ))}
                            {location.location_amenities.length > 5 ? (
                              <span className="text-[10px] text-text-3 self-center">
                                +{location.location_amenities.length - 5} more
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-end justify-between gap-2 mt-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex items-center gap-1 text-[11px] text-text-3">
                            <Star
                              size={11}
                              className="fill-warning text-warning"
                            />
                            <strong className="text-text font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>
                              {location.matching_space_count}
                            </strong>
                            <span>
                              {location.matching_space_count === 1
                                ? "matching space"
                                : "matching spaces"}
                            </span>
                          </div>
                          {chips[0] ? (
                            <span
                              className="font-mono text-[14px] font-semibold tracking-[-0.01em] truncate"
                              style={{ fontVariantNumeric: "tabular-nums" }}
                            >
                              {chips[0].value}
                              <span className="text-[10px] text-text-3 font-sans font-medium ml-1">
                                {chips[0].label.toLowerCase()}
                              </span>
                            </span>
                          ) : null}
                        </div>
                        <div className="flex gap-1.5 flex-none">
                          <Link
                            href={locationHref}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Button variant="ghost" size="sm">
                              View location
                            </Button>
                          </Link>
                          <Link
                            href={primaryHref}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Button variant="primary" size="sm">
                              Open listing
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="lg:sticky lg:top-6 lg:self-start">
            <Card padded={false} className="overflow-hidden">
              <PublicMarketplaceMap
                locations={results}
                selectedLocationId={selectedLocationId}
                onSelect={handleSelectLocation}
              />
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}

function SearchField({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-text-3 mb-1">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <span className="flex-none">{icon}</span>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </label>
  );
}
