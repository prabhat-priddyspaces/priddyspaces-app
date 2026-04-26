"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { clearAccessToken, getAccessToken } from "@/lib/auth";
import { CustomerSideNav } from "@/components/customer-side-nav";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { getDefaultRoute, type MeResponse } from "@/lib/me";

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    apiFetch<MeResponse>("/api/me", { method: "GET" }, token)
      .then((me) => {
        const customerAllowed =
          me.app_role === "customer" && (!me.platform_role || me.impersonation.is_impersonating);
        if (!customerAllowed) {
          router.replace(getDefaultRoute(me));
        } else {
          setAllowed(true);
          setMe(me);
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

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner
        impersonation={
          me?.impersonation ?? {
            is_impersonating: false,
            actor_public_id: null,
            actor_email: null,
            actor_platform_role: null,
            target_public_id: null,
            target_email: null,
            reason: null,
          }
        }
      />
      <div className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
        <div>
          <div className="text-sm text-textMuted">Priddyspaces</div>
          <h1 className="text-lg font-semibold text-textPrimary">Customer Workspace</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            clearAccessToken();
            router.replace("/login");
          }}
          className="text-sm text-textSecondary hover:underline"
        >
          Logout
        </button>
      </div>
      <div className="mx-auto flex max-w-6xl gap-6 px-6 py-8">
        <CustomerSideNav />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
