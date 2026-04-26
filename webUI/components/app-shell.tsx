"use client";

import { ReactNode, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { SideNav } from "@/components/side-nav";
import { Topbar } from "@/components/topbar";
import type { MeResponse } from "@/lib/me";

export function AppShell({ children }: { children: ReactNode }) {
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
      <Topbar me={me} />
      <div className="mx-auto flex max-w-6xl gap-6 px-6 py-8">
        <SideNav />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
