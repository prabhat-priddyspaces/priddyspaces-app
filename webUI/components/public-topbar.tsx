"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAppSignOut } from "@/hooks/useAppSignOut";
import { apiFetch } from "@/lib/api";
import { clearAccessToken, getAccessToken } from "@/lib/auth";
import { getDashboardHref, type MeResponse } from "@/lib/me";

type AuthState =
  | { status: "unknown"; me: null }
  | { status: "guest"; me: null }
  | { status: "user"; me: MeResponse };

export function PublicTopbar({ subtitle = "Public Marketplace" }: { subtitle?: string }) {
  const [auth, setAuth] = useState<AuthState>({ status: "unknown", me: null });
  const appSignOut = useAppSignOut();

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setAuth({ status: "guest", me: null });
      return;
    }
    apiFetch<MeResponse>("/api/me", { method: "GET" }, token)
      .then((me) => setAuth({ status: "user", me }))
      .catch(() => {
        clearAccessToken();
        setAuth({ status: "guest", me: null });
      });
  }, []);

  function handleSignOut() {
    void appSignOut({
      redirectTo: null,
      onSignedOut: () => setAuth({ status: "guest", me: null }),
    });
  }

  return (
    <div className="border-b border-slate-200/70 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-5">
        <Link href="/coworking" className="block">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-700">Priddyspaces</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{subtitle}</div>
        </Link>
        <div className="flex items-center gap-3">
          {auth.status === "user" ? (
            <>
              <Link
                href={getDashboardHref(auth.me)}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
              >
                Dashboard
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Sign out
              </button>
            </>
          ) : auth.status === "guest" ? (
            <>
              <Link
                href="/sign-in"
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Join Now
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
