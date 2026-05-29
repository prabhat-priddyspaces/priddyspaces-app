"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
    <div className="w-full border-b border-line bg-bg-elev/90 backdrop-blur sticky top-0 z-30">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-4">
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
              <Link href="/sign-up">
                <Button variant="primary" size="default">
                  Get started
                </Button>
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
