"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { getDefaultRoute, type MeResponse } from "@/lib/me";

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    apiFetch<MeResponse>("/api/me", { method: "GET" }, token)
      .then((me) => {
        const ownerAllowed =
          me.app_role === "owner" && (!me.platform_role || me.impersonation.is_impersonating);
        if (!ownerAllowed) {
          router.replace(getDefaultRoute(me));
        } else {
          setAllowed(true);
        }
      })
      .catch(() => {
        router.replace("/login");
      })
      .finally(() => {
        setChecking(false);
      });
  }, [router]);

  if (checking || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-textSecondary">
        Loading...
      </div>
    );
  }

  return <>{children}</>;
}
