"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function DefaultMarketplaceRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/coworking");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="rounded-3xl border border-border bg-white px-8 py-10 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-textPrimary">Opening Priddyspaces Search</h1>
        <p className="mt-2 max-w-md text-sm text-textSecondary">
          If you are not redirected automatically, continue to the public coworking marketplace.
        </p>
        <Link
          href="/coworking"
          className="mt-6 inline-flex rounded-full border border-slate-900 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
        >
          Continue to Coworking
        </Link>
      </div>
    </main>
  );
}
