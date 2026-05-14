import type { PublicMarketplaceRoute } from "@/lib/public-marketplace";

export type LegacySearchParams = Record<string, string | string[] | undefined>;

const LEGACY_PLACEHOLDERS = new Set(["_", "_.html"]);

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function appendSearchParam(
  params: URLSearchParams,
  key: string,
  value: string | string[] | undefined,
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item) params.append(key, item);
    }
    return;
  }
  if (value) params.set(key, value);
}

function queryString(params: URLSearchParams) {
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function legacyLocationRedirectHref(
  routeKey: PublicMarketplaceRoute,
  pathLocationId: string,
  searchParams: LegacySearchParams,
) {
  const locationId = LEGACY_PLACEHOLDERS.has(pathLocationId)
    ? firstParam(searchParams.id)
    : pathLocationId;

  const next = new URLSearchParams();
  if (!locationId) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (key !== "id") appendSearchParam(next, key, value);
    }
    return `/${routeKey}${queryString(next)}`;
  }

  next.set("route", routeKey);
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "id" || key === "route") continue;
    appendSearchParam(next, key, value);
  }

  return `/locations/${encodeURIComponent(locationId)}${queryString(next)}`;
}
