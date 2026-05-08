"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";

import { apiFetch } from "@/lib/api";
import { CustomerSideNav } from "@/components/customer-side-nav";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { getDefaultRoute, type MeResponse } from "@/lib/me";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    getToken()
      .then((token) => apiFetch<MeResponse>("/api/me", { method: "GET" }, token ?? undefined))
      .then((data) => {
        const customerAllowed =
          data.app_role === "customer" &&
          (!data.platform_role || data.impersonation.is_impersonating);
        if (!customerAllowed) {
          router.replace(getDefaultRoute(data));
        } else {
          setAllowed(true);
          setMe(data);
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
          onClick={() => signOut(() => router.replace("/sign-in"))}
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
