"use client";

import Link from "next/link";

import type { MeResponse } from "@/lib/me";

export function Topbar({ me }: { me: MeResponse | null }) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
      <div>
        <div className="text-sm text-textMuted">Priddyspaces</div>
        <h1 className="text-lg font-semibold text-textPrimary">Owner Workspace</h1>
      </div>
      <div className="flex items-center gap-4 text-sm text-textSecondary">
        {me?.platform_role ? (
          <Link href="/admin" className="text-sm text-accent hover:underline">
            Platform Console
          </Link>
        ) : null}
        <span>{me?.email || "—"}</span>
      </div>
    </div>
  );
}
