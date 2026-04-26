"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiFetch } from "@/lib/api";
import { getAccessToken, setAccessToken } from "@/lib/auth";
import type { ImpersonationContext } from "@/lib/me";

interface StopResponse {
  access_token: string;
  default_route: string;
}

export function ImpersonationBanner({
  impersonation,
}: {
  impersonation: ImpersonationContext;
}) {
  const router = useRouter();
  const [stopping, setStopping] = useState(false);
  const token = getAccessToken() ?? undefined;

  if (!impersonation.is_impersonating) {
    return null;
  }

  async function stopImpersonation() {
    if (!token || stopping) {
      return;
    }
    setStopping(true);
    try {
      const response = await apiFetch<StopResponse>(
        "/api/admin/impersonation/stop",
        { method: "POST" },
        token
      );
      setAccessToken(response.access_token);
      router.replace(response.default_route);
    } finally {
      setStopping(false);
    }
  }

  return (
    <div className="border-b border-amber-300 bg-amber-100 px-6 py-3 text-sm text-amber-950">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div>
          Impersonating {impersonation.target_email} as {impersonation.actor_email}.
          {impersonation.reason ? ` Reason: ${impersonation.reason}` : ""}
        </div>
        <button
          type="button"
          onClick={stopImpersonation}
          disabled={stopping}
          className="rounded-sm border border-amber-700 px-3 py-1 font-medium hover:bg-amber-200 disabled:opacity-60"
        >
          {stopping ? "Stopping..." : "Stop impersonation"}
        </button>
      </div>
    </div>
  );
}
