"use client";

import Link from "next/link";
import { Building2, ChevronDown, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { useAppSignOut } from "@/hooks/useAppSignOut";
import { apiFetch } from "@/lib/api";
import { clearAccessToken, getAccessToken } from "@/lib/auth";
import { getDashboardHref, type MeResponse } from "@/lib/me";

type AuthState =
  | { status: "unknown"; me: null }
  | { status: "guest"; me: null }
  | { status: "user"; me: MeResponse };

export function PublicTopbar({
  subtitle = "Public Marketplace",
}: {
  subtitle?: string;
}) {
  const [auth, setAuth] = useState<AuthState>({ status: "unknown", me: null });
  const [getStartedOpen, setGetStartedOpen] = useState(false);
  const getStartedRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!getStartedOpen) return;
    function handleClick(event: MouseEvent) {
      if (!getStartedRef.current?.contains(event.target as Node)) {
        setGetStartedOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [getStartedOpen]);

  function handleSignOut() {
    void appSignOut({
      redirectTo: null,
      onSignedOut: () => setAuth({ status: "guest", me: null }),
    });
  }

  return (
    <div className="w-full border-b border-line bg-bg-elev/90 backdrop-blur sticky top-0 z-30">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 py-4">
        <Link
          href="/spaces"
          className="flex items-center gap-3"
        >
          <Logo size={32} />
          <div>
            <div className="text-[15px] font-semibold tracking-[-0.01em] text-text">
              Priddyspaces
            </div>
            <div className="text-[11px] text-text-3 -mt-0.5">{subtitle}</div>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {auth.status === "user" ? (
            <>
              <Link href={getDashboardHref(auth.me)}>
                <Button variant="default" size="default">
                  Dashboard
                </Button>
              </Link>
              <Button variant="primary" size="default" onClick={handleSignOut}>
                Sign out
              </Button>
            </>
          ) : auth.status === "guest" ? (
            <>
              <Link href="/sign-in">
                <Button variant="default" size="default">
                  Sign in
                </Button>
              </Link>
              <div ref={getStartedRef} className="relative">
                <Button
                  type="button"
                  variant="primary"
                  size="default"
                  onClick={() => setGetStartedOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={getStartedOpen}
                  className="gap-2"
                >
                  Get started
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${getStartedOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </Button>
                {getStartedOpen ? (
                  <div
                    role="menu"
                    aria-label="Registration options"
                    className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-md border border-line bg-surface p-1 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.45)]"
                  >
                    <Link
                      href="/sign-up"
                      role="menuitem"
                      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-text transition hover:bg-surface-2"
                      onClick={() => setGetStartedOpen(false)}
                    >
                      <UserRound className="h-4 w-4 text-text-3" aria-hidden="true" />
                      <span>Member registration</span>
                    </Link>
                    <Link
                      href="/owners/sign-up"
                      role="menuitem"
                      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-text transition hover:bg-surface-2"
                      onClick={() => setGetStartedOpen(false)}
                    >
                      <Building2 className="h-4 w-4 text-text-3" aria-hidden="true" />
                      <span>Owner registration</span>
                    </Link>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
