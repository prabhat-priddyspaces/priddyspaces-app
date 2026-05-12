"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const DETAIL_QUERY_KEYS = ["date", "start_time", "end_time", "plan", "move_in"];

function legacyStaticDetailHref(pathname: string, search: string) {
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

export function DefaultMarketplaceRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace(legacyStaticDetailHref(window.location.pathname, window.location.search) || "/spaces");
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
