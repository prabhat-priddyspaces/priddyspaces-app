"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

import { apiFetch } from "@/lib/api";
import { getDefaultRoute, type MeResponse } from "@/lib/me";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
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
        const ownerAllowed =
          me.app_role === "owner" &&
          (!me.platform_role || me.impersonation.is_impersonating);
        if (!ownerAllowed) {
          router.replace(getDefaultRoute(me));
        } else {
          setAllowed(true);
        }
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
