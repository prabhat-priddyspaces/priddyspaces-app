"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const DETAIL_QUERY_KEYS = ["date", "start_time", "end_time", "plan", "move_in"];
const APP_ROUTE_PREFIXES = [
  "/admin",
  "/dashboard",
  "/member",
  "/onboarding",
  "/owner",
];

export function legacyStaticDetailHref(pathname: string, search: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || segments[0] !== "spaces") return null;

  const spaceId = segments[1];
  if (!spaceId || spaceId === "_" || spaceId === "_.html") return null;

  const current = new URLSearchParams(search);
  const next = new URLSearchParams();
  next.set("id", decodeURIComponent(spaceId));
  next.set("back", current.get("back") || "/spaces");
  for (const key of DETAIL_QUERY_KEYS) {
    const value = current.get(key);
    if (value) next.set(key, value);
  }
  return `/spaces/_.html?${next.toString()}`;
}

export function defaultMarketplaceFallbackHref(pathname: string, search: string) {
  const legacyHref = legacyStaticDetailHref(pathname, search);
  if (legacyHref) return legacyHref;
  if (pathname === "/" || pathname === "") return "/spaces";
  if (
    APP_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return null;
  }
  return "/spaces";
}

export function DefaultMarketplaceRedirect() {
  const router = useRouter();
  const [fallbackHref, setFallbackHref] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const nextHref = defaultMarketplaceFallbackHref(
      window.location.pathname,
      window.location.search,
    );
    setFallbackHref(nextHref);
    if (nextHref) router.replace(nextHref);
  }, [router]);

  const isAppRouteMiss = fallbackHref === null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="rounded-3xl border border-border bg-white px-8 py-10 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-textPrimary">
          {isAppRouteMiss ? "Page unavailable" : "Opening Priddyspaces"}
        </h1>
        <p className="mt-2 max-w-md text-sm text-textSecondary">
          {isAppRouteMiss
            ? "This application route was not found in the static deployment."
            : "If you are not redirected automatically, continue to the marketplace."}
        </p>
        <Link
          href={isAppRouteMiss ? "/dashboard" : "/spaces"}
          className="mt-6 inline-flex rounded-full border border-slate-900 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
        >
          {isAppRouteMiss ? "Open Dashboard" : "Continue to Spaces"}
        </Link>
      </div>
    </main>
  );
}
