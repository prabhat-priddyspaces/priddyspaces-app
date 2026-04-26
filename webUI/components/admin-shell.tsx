"use client";

import { ReactNode, useEffect, useState } from "react";

import { AdminSideNav } from "@/components/admin-side-nav";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { MeResponse } from "@/lib/me";

const emptyImpersonation = {
  is_impersonating: false,
  actor_public_id: null,
  actor_email: null,
  actor_platform_role: null,
  target_public_id: null,
  target_email: null,
  reason: null,
};

export function AdminShell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    apiFetch<MeResponse>("/api/me", { method: "GET" }, token)
      .then(setMe)
      .catch(() => null);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner impersonation={me?.impersonation ?? emptyImpersonation} />
      <div className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
        <div>
          <div className="text-sm text-textMuted">Priddyspaces</div>
          <h1 className="text-lg font-semibold text-textPrimary">Platform Console</h1>
        </div>
        <div className="text-sm text-textSecondary">
          {me?.email || "Loading..."}
          {me?.platform_role ? ` • ${me.platform_role}` : ""}
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-8">
        <AdminSideNav platformRole={me?.platform_role ?? null} />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
