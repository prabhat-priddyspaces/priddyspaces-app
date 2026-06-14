"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  getSpacePriceChips,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
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
  const resultCards = useMemo(
    () =>
      results.flatMap((location) => {
        const spaces = location.spaces?.length ? location.spaces : [null];
        return spaces.map((space) => ({
          location,
          space,
          cardKey: space
            ? `${location.location_public_id}-${space.public_id}`
            : location.location_public_id,
        }));
      }),
    [results],
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
        setSelectedLocationId((current) =>
          response.results.some((result) => result.location_public_id === current)
            ? current
            : response.results[0]?.location_public_id || null
        );
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load marketplace locations");
        setResults([]);
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

  function buildSearchHref(nextForm = form) {
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
    return nextQuery ? `${pathname}?${nextQuery}` : pathname;
  }

  function updateSearch(nextForm = form) {
    router.push(buildSearchHref(nextForm));
  }

  function valueFromForm(data: FormData, key: keyof typeof DEFAULT_FORM) {
    const value = data.get(key);
    return typeof value === "string" ? value : "";
  }

  function submitSearchFromForm(
    formElement: HTMLFormElement,
    options: { documentNavigation?: boolean } = {},
  ) {
    const data = new FormData(formElement);
    const q = valueFromForm(data, "q");
    const qChangedOutsideReact = q !== form.q;
    const nextForm = {
      ...form,
      q,
      date: valueFromForm(data, "date"),
      start_time: valueFromForm(data, "start_time"),
      end_time: valueFromForm(data, "end_time"),
      capacity: valueFromForm(data, "capacity"),
      max_price: valueFromForm(data, "max_price"),
      max_price_monthly: valueFromForm(data, "max_price_monthly"),
      sort: valueFromForm(data, "sort"),
      lat: qChangedOutsideReact ? "" : valueFromForm(data, "lat"),
      lng: qChangedOutsideReact ? "" : valueFromForm(data, "lng"),
      radius_miles: valueFromForm(data, "radius_miles"),
    };
    const href = buildSearchHref(nextForm);
    const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent.toLowerCase();
    if (options.documentNavigation && typeof window !== "undefined" && !userAgent.includes("jsdom")) {
      window.location.assign(href);
      return;
    }
    router.push(href);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (event.defaultPrevented) return;
    event.preventDefault();
    submitSearchFromForm(event.currentTarget);
  }

  function bindSearchForm(node: HTMLFormElement | null) {
    formRef.current = node;
  }

  function bindSearchButton(node: HTMLButtonElement | null) {
    if (!node) return;
    node.onclick = (event) => {
      event.preventDefault();
      const formElement = formRef.current || node.form;
      if (formElement) {
        submitSearchFromForm(formElement, { documentNavigation: true });
      }
    };
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
    <main className="w-full min-h-screen bg-bg text-text">
      <PublicTopbar />

      <section className="mx-auto max-w-[1440px] px-4 sm:px-6 pt-6 lg:pt-8">
        <div className="flex flex-col gap-1.5 mb-4">
          <h1 className="text-[32px] lg:text-[40px] font-semibold text-text">
            {config.title}
          </h1>
          <p className="max-w-2xl text-[14px] text-text-2">{config.subtitle}</p>
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
                    "mt-0.5 text-[12px] leading-tight",
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
            ref={bindSearchForm}
            onSubmit={handleSubmit}
            action={pathname}
            method="get"
            className="grid gap-0 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] divide-y lg:divide-y-0 lg:divide-x divide-line"
          >
            <input type="hidden" name="sort" value={form.sort} />
            <input type="hidden" name="lat" value={form.lat} />
            <input type="hidden" name="lng" value={form.lng} />
            <input type="hidden" name="radius_miles" value={form.radius_miles} />
            <SearchField
              icon={<MapPin size={13} className="text-brand" />}
              label="Where"
            >
              <div className="flex items-center gap-2">
                <input
                  ref={searchInputRef}
                  name="q"
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
                  className="flex-1 min-w-0 bg-transparent text-[14px] font-medium text-text outline-none placeholder:text-text-4"
                />
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={locating}
                  title="Use my current location"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-text-3 transition hover:border-brand hover:text-brand disabled:cursor-wait disabled:opacity-60"
                >
                  <Compass className="h-3 w-3" />
                  {locating ? "Locating…" : "Locate me"}
                </button>
              </div>
            </SearchField>

            <SearchField
              icon={<CalendarIcon size={13} className="text-text-3" />}
              label="When"
            >
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                className="bg-transparent text-[14px] font-medium text-text outline-none w-full"
              />
            </SearchField>

            {routeKey === "meeting-rooms" ? (
              <>
                <SearchField
                  icon={<Clock3 size={13} className="text-text-3" />}
                  label="Start"
                >
                  <input
                    type="time"
                    name="start_time"
                    value={form.start_time}
                    onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))}
                    className="bg-transparent text-[14px] font-medium text-text outline-none w-full"
                  />
                </SearchField>
                <SearchField
                  icon={<Clock3 size={13} className="text-text-3" />}
                  label="End"
                >
                  <input
                    type="time"
                    name="end_time"
                    value={form.end_time}
                    onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))}
                    className="bg-transparent text-[14px] font-medium text-text outline-none w-full"
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
                    name="capacity"
                    min="1"
                    value={form.capacity}
                    onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
                    placeholder="Min capacity"
                    className="bg-transparent text-[14px] font-medium text-text outline-none w-full placeholder:text-text-4"
                  />
                </SearchField>
                <SearchField
                  icon={<SlidersHorizontal size={13} className="text-text-3" />}
                  label={config.priceLabel}
                >
                  <input
                    type="number"
                    name={config.priceParamKey}
                    min="0"
                    value={
                      config.priceParamKey === "max_price_monthly"
                        ? form.max_price_monthly
                        : form.max_price
                    }
                    onChange={(event) => updatePriceValue(event.target.value)}
                    placeholder="Any"
                    className="bg-transparent text-[14px] font-medium text-text outline-none w-full placeholder:text-text-4"
                  />
                </SearchField>
              </>
            )}

            <div className="p-2 flex items-stretch">
              <button
                ref={bindSearchButton}
                type="submit"
                className="inline-flex w-full h-11 lg:h-auto items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[14px] font-semibold text-white transition hover:bg-brand-hover lg:min-w-[120px]"
              >
                <Search size={14} strokeWidth={2.5} />
                Search
              </button>
            </div>
          </form>
        </Card>

        {/* Helper / radius / sort row */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[12px] text-text-3">
            <Compass className="h-3.5 w-3.5" />
            <span className="text-[12px] text-text-3 font-semibold">Within</span>
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
              <span className="text-[12px] text-text-4">Pick a place</span>
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
            <p className="text-[12px] text-text-4">{autocompleteWarning}</p>
          )}
          {locationNotice && (
            <p className="text-[12px] text-text-4">{locationNotice}</p>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 sm:px-6 pb-12">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
          <div className="space-y-3.5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[14px] text-text-2">
                  <strong className="text-text">Showing {resultCards.length} listings</strong>
                </div>
                <div className="mt-0.5 text-[12px] text-text-3">
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

            {resultCards.map(({ location, space, cardKey }, index) => {
              const chips = getLocationPriceChips(config, location);
              const spaceChips = space ? getSpacePriceChips(config, space) : [];
              const active = location.location_public_id === selectedLocationId;
              const locationHref = buildMarketplaceLocationHref(
                routeKey,
                location.location_public_id,
                currentSearch,
              );
              const primaryHref = space
                ? buildMarketplaceSpaceHref(space.public_id, routeKey, currentSearch)
                : location.featured_space_public_id
                ? buildMarketplaceSpaceHref(location.featured_space_public_id, routeKey, currentSearch)
                : locationHref;
              const listingTitle = space?.name || location.name;
              const listingImage = space?.image_url || location.featured_image_url;
              const primaryPrice = spaceChips[0] ?? (chips[0] ? `${chips[0].value} ${chips[0].label.toLowerCase()}` : null);
              const featured = index === 0;
              const waitlistAvailable = Boolean(
                space?.waitlist_enabled && space.availability_status === "waitlist_available",
              );

              function handleCardActivate() {
                handleSelectLocation(location.location_public_id);
                router.push(primaryHref);
              }

              return (
                <div
                  key={cardKey}
                  ref={(node) => {
                    cardRefs.current[cardKey] = node;
                    cardRefs.current[location.location_public_id] = node;
                  }}
                  data-selected={active ? "true" : "false"}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open ${listingTitle}`}
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
                  <div className="flex gap-2 sm:gap-3">
                    <div
                      className="relative w-24 h-24 sm:w-32 sm:h-28 rounded-xl overflow-hidden flex-none"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--ps-violet-100), var(--ps-mint-100))",
                      }}
                    >
                      <PublicImageWithFallback
                        src={listingImage}
                        alt={listingTitle}
                        className="h-full w-full object-cover"
                        fallbackClassName="absolute inset-0 grid place-items-center text-brand opacity-50"
                      />
                      {featured ? (
                        <Badge
                          variant="violet"
                          className="absolute right-2 top-2 h-6 bg-brand px-2 text-[12px] text-white"
                        >
                          <Sparkles size={10} strokeWidth={2.5} />
                          Featured
                        </Badge>
                      ) : null}
                      {!listingImage ? (
                        <div className="absolute inset-0 grid place-items-center text-brand opacity-40 pointer-events-none">
                          <Building2 size={28} />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h2 className="truncate text-[16px] font-semibold">
                              {listingTitle}
                            </h2>
                            <div className="mt-0.5 truncate text-[13px] text-text-3">
                              {formatLocationAddress(location)}
                            </div>
                            {waitlistAvailable ? (
                              <Badge variant="default" className="mt-2 bg-warning-soft text-warning">
                                Currently leased · Waitlist available
                              </Badge>
                            ) : null}
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
                                className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2 text-[12px] font-medium text-text-3"
                              >
                                {amenity}
                              </span>
                            ))}
                            {location.location_amenities.length > 5 ? (
                              <span className="self-center text-[12px] text-text-3">
                                +{location.location_amenities.length - 5} more
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-end gap-x-2 gap-y-2 mt-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {space ? (
                            <div className="flex items-center gap-1 text-[12px] text-text-3">
                              <Users size={11} />
                              <strong className="text-text font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>
                                {space.capacity}
                              </strong>
                              <span>{space.capacity === 1 ? "seat" : "seats"}</span>
                            </div>
                          ) : null}
                          {primaryPrice ? (
                            <span
                              className="font-mono text-[14px] font-semibold tracking-[-0.01em] truncate"
                              style={{ fontVariantNumeric: "tabular-nums" }}
                            >
                              {primaryPrice}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex gap-1.5 shrink-0 ml-auto">
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
      <div className="mb-1 text-[12px] font-semibold text-text-3">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <span className="flex-none">{icon}</span>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </label>
  );
}
