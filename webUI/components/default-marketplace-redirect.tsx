"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const DETAIL_QUERY_KEYS = ["date", "start_time", "end_time", "plan", "move_in"];

function legacyStaticDetailHref(pathname: string, search: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || !["spaces", "locations"].includes(segments[0])) return null;

  const resourceId = segments[1];
  if (!resourceId || resourceId === "_" || resourceId === "_.html") return null;

  const next = new URLSearchParams();
  next.set("id", decodeURIComponent(resourceId));

  if (segments[0] === "spaces") {
    const current = new URLSearchParams(search);
    next.set("back", current.get("back") || "/spaces");
    for (const key of DETAIL_QUERY_KEYS) {
      const value = current.get(key);
      if (value) next.set(key, value);
    }
  }
  return `/${segments[0]}/_.html?${next.toString()}`;
}

function staticExportHtmlHref(pathname: string, search: string) {
  if (pathname.startsWith("/_next/") || pathname.startsWith("/api/")) return null;

  const targetPath = pathname === "/" ? "/spaces" : pathname.replace(/\/+$/, "");
  const lastSegment = targetPath.split("/").pop() || "";
  if (!targetPath || lastSegment.includes(".")) return null;

  return `${targetPath}.html${search}`;
}

export function DefaultMarketplaceRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace(
      legacyStaticDetailHref(window.location.pathname, window.location.search) ||
        staticExportHtmlHref(window.location.pathname, window.location.search) ||
        "/spaces.html",
    );
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="rounded-3xl border border-border bg-white px-8 py-10 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-textPrimary">Opening Priddyspaces Search</h1>
        <p className="mt-2 max-w-md text-sm text-textSecondary">
          If you are not redirected automatically, continue to the public spaces marketplace.
        </p>
        <Link
          href="/spaces"
          className="mt-6 inline-flex rounded-full border border-slate-900 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
        >
          Continue to Spaces
        </Link>
      </div>
    </main>
  );
}
