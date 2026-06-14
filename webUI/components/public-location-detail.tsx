"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { PublicImageWithFallback } from "@/components/public-image-with-fallback";
import { PublicWorkingHours } from "@/components/public-working-hours";
import { PublicTopbar } from "@/components/public-topbar";
import {
  PUBLIC_MARKETPLACE_CONFIGS,
  PUBLIC_MARKETPLACE_TABS,
  PublicMarketplaceRoute,
  buildApiSearchParams,
  buildMarketplaceSpaceHref,
  buildBackHref,
  formatLocationAddress,
  formatSpaceTypeLabel,
  getLocationPriceChips,
  getSpacePriceChips,
  MarketplaceLocationDetail,
} from "@/lib/public-marketplace";

interface PublicLocationDetailProps {
  routeKey: PublicMarketplaceRoute;
  locationId: string;
}

export function PublicLocationDetail({ routeKey, locationId }: PublicLocationDetailProps) {
  const searchParams = useSearchParams();
  const requestedRoute = searchParams.get("route");
  const initialRoute =
    requestedRoute && requestedRoute in PUBLIC_MARKETPLACE_CONFIGS
      ? (requestedRoute as PublicMarketplaceRoute)
      : routeKey;
  const isLegacyPlaceholder =
    !locationId || locationId === "_" || locationId === "_.html";
  const effectiveLocationId =
    isLegacyPlaceholder ? searchParams.get("id") || "" : locationId;
  const filterQueryString = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("id");
    params.delete("route");
    return params.toString();
  }, [searchParams]);

  // Show all categories at this location, defaulting to the route the user came from.
  const [activeRoute, setActiveRoute] = useState<PublicMarketplaceRoute>(initialRoute);
  useEffect(() => {
    setActiveRoute(initialRoute);
  }, [initialRoute]);
  const activeConfig = PUBLIC_MARKETPLACE_CONFIGS[activeRoute];

  const [location, setLocation] = useState<MarketplaceLocationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!effectiveLocationId) {
      setLoading(false);
      setError("Location not found");
      return;
    }
    const params = buildApiSearchParams(activeConfig, new URLSearchParams(filterQueryString));
    setLoading(true);
    setError("");
    apiFetch<MarketplaceLocationDetail>(
      `/api/marketplace/locations/${effectiveLocationId}?${params.toString()}`,
      { method: "GET" },
    )
      .then(setLocation)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load location");
        setLocation(null);
      })
      .finally(() => setLoading(false));
  }, [activeConfig, effectiveLocationId, filterQueryString]);

  // Back link returns to the original search route, not whichever tab the user opened here.
  const backHref = useMemo(
    () => buildBackHref(initialRoute, filterQueryString),
    [initialRoute, filterQueryString],
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-bg">
        <PublicTopbar />
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-text-3">Loading location…</div>
      </main>
    );
  }

  if (error && !location) {
    return (
      <main className="min-h-screen bg-bg">
        <PublicTopbar />
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Link href={backHref} className="text-sm text-brand hover:underline">
            Back to search
          </Link>
          <p className="mt-4 text-sm text-danger">{error}</p>
        </div>
      </main>
    );
  }

  if (!location) {
    return (
      <main className="min-h-screen bg-bg">
        <PublicTopbar />
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Link href={backHref} className="text-sm text-brand hover:underline">
            Back to search
          </Link>
          <p className="mt-4 text-sm text-text-3">Location not found</p>
        </div>
      </main>
    );
  }

  const chips = getLocationPriceChips(activeConfig, location);

  return (
    <main className="min-h-screen bg-bg">
      <PublicTopbar />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <Link href={backHref} className="text-sm font-medium text-brand hover:underline">
          Back to search
        </Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
              <PublicImageWithFallback
                src={location.featured_image_url}
                alt={location.name}
                className="h-80 w-full object-cover"
                fallbackClassName="flex h-80 items-center justify-center bg-surface-2 text-sm font-semibold text-text-3"
              />
            </div>

            <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <h1 className="text-[32px] font-semibold text-text">{location.name}</h1>
              <p className="mt-2 text-sm text-text-2">{formatLocationAddress(location)}</p>
              {location.neighborhood ? (
                <p className="mt-2 text-xs font-medium text-brand">{location.neighborhood}</p>
              ) : null}

              {chips.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {chips.map((chip) => (
                    <div
                      key={`${location.location_public_id}-${chip.label}`}
                      className="rounded-full border border-line bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-strong"
                    >
                      <span className="mr-2 text-brand">{chip.label}</span>
                      {chip.value}
                    </div>
                  ))}
                </div>
              ) : null}

              {location.location_amenities.length > 0 ? (
                <div className="mt-6 flex flex-wrap gap-2">
                  {location.location_amenities.map((amenity) => (
                    <span
                      key={amenity}
                      className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-text-2"
                    >
                      {amenity}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <div className="text-center text-[17px] font-semibold text-text">
                Find Your Ideal Workspace
              </div>
              <div
                className="mt-3 grid gap-2"
                style={{ gridTemplateColumns: `repeat(${PUBLIC_MARKETPLACE_TABS.length}, minmax(0, 1fr))` }}
              >
                {PUBLIC_MARKETPLACE_TABS.map((tab) => {
                  const isActive = tab.routeKey === activeRoute;
                  return (
                    <button
                      key={tab.routeKey}
                      type="button"
                      onClick={() => setActiveRoute(tab.routeKey)}
                      className={`rounded-2xl border px-3 py-3 text-left transition ${
                        isActive
                          ? "border-brand bg-brand-soft shadow-sm"
                          : "border-line bg-surface-2 hover:border-line-strong hover:bg-surface"
                      }`}
                    >
                      <div className="text-sm font-semibold text-text">{tab.label}</div>
                      <div className="mt-1 text-xs text-text-3">{tab.subtitle.split(".")[0]}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <div className="text-sm font-semibold text-text">
                {location.spaces.length} matching {location.spaces.length === 1 ? "space" : "spaces"}
              </div>
              <div className="mt-1 text-sm text-text-3">
                {activeConfig.label} at this location, filtered by your current search.
              </div>
            </div>

            <PublicWorkingHours
              enabled={location.public_working_hours_enabled}
              hours={location.public_working_hours}
            />

            {location.spaces.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-6 text-sm text-text-3">
                No {activeConfig.label.toLowerCase()} match your filters at this location. Try a different category above.
              </div>
            ) : null}

            {location.spaces.map((space) => {
              const chipsForSpace = getSpacePriceChips(activeConfig, space);
              const spaceHref = buildMarketplaceSpaceHref(space.public_id, activeRoute, filterQueryString);
              const waitlistAvailable = Boolean(
                space.waitlist_enabled && space.availability_status === "waitlist_available",
              );

              return (
                <div key={space.public_id} className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
                  <div className="flex gap-4">
                    <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-surface-2">
                      <PublicImageWithFallback
                        src={space.image_url}
                        alt={space.space_type}
                        className="h-full w-full object-cover"
                        fallbackLabel="Space"
                        fallbackClassName="flex h-full items-center justify-center bg-surface-2 text-[12px] font-semibold text-text-3"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[17px] font-semibold text-text">
                            {space.name}
                          </div>
                          <div className="mt-1 text-sm text-text-2">
                            {formatSpaceTypeLabel(space.space_type)} • Capacity {space.capacity} •{" "}
                            {waitlistAvailable ? "currently leased · waitlist available" : space.availability_status.replaceAll("_", " ")}
                          </div>
                          {space.availability_start_time || space.availability_end_time ? (
                            <div className="mt-1 text-sm text-text-3">
                              Hours: {space.availability_start_time || "—"} to {space.availability_end_time || "—"}
                            </div>
                          ) : null}
                        </div>
                        <Link
                          href={spaceHref}
                          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover"
                        >
                          View space
                        </Link>
                      </div>

                      {chipsForSpace.length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {chipsForSpace.map((chip) => (
                            <span
                              key={`${space.public_id}-${chip}`}
                              className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-semibold text-text-2"
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {space.amenities.length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {space.amenities.slice(0, 6).map((amenity) => (
                            <span
                              key={`${space.public_id}-${amenity}`}
                              className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-text-2"
                            >
                              {amenity}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
