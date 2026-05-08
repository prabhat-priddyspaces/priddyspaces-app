"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

import { apiFetch } from "@/lib/api";
import { getDefaultRoute, type MeResponse } from "@/lib/me";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    getToken()
      .then((token) => apiFetch<MeResponse>("/api/me", { method: "GET" }, token ?? undefined))
      .then((me) => {
        if (me.impersonation.is_impersonating || !me.platform_role) {
          router.replace(getDefaultRoute(me));
          return;
        }
        setAllowed(true);
      })
      .catch(() => router.replace("/sign-in"))
      .finally(() => setChecking(false));
  }, [isLoaded, isSignedIn, getToken, router]);

  if (checking || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-textSecondary">
        Loading...
      </div>
    );
  }

  return <>{children}</>;
}
