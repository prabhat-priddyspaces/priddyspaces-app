"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { getDefaultRoute, type MeResponse } from "@/lib/me";

export default function AdminLayout({
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
        if (me.impersonation.is_impersonating) {
          router.replace(getDefaultRoute(me));
          return;
        }
        if (!me.platform_role) {
          router.replace(getDefaultRoute(me));
          return;
        }
        setAllowed(true);
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
