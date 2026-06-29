"use client";

import * as React from "react";

import { AppShell } from "@/components/app-shell";
import { Label } from "@/components/ui/label";
import { OwnerOrgProvider, useOwnerOrg } from "./_components/owner-org-provider";
import { SettingsSubNav } from "./_components/settings-sub-nav";

function OrgScopeSelector() {
  const { orgs, orgId, setOrgId, loading, error } = useOwnerOrg();
  return (
    <div className="flex flex-col gap-1.5 sm:max-w-xs">
      <Label htmlFor="settings-org">Organization</Label>
      <select
        id="settings-org"
        value={orgId}
        onChange={(event) => setOrgId(event.target.value)}
        disabled={loading || orgs.length === 0}
        className="h-10 rounded-lg border border-line bg-surface px-3 text-[13px] text-text disabled:opacity-60"
      >
        <option value="">Select an organization</option>
        {orgs.map((org) => (
          <option key={org.public_id} value={org.public_id}>
            {org.name}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-text-3">
        {error ?? "Every setting below applies to the organization selected here."}
      </p>
    </div>
  );
}

export default function OwnerSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <OwnerOrgProvider>
      <AppShell title="Settings" breadcrumb={["Owner", "Settings"]}>
        <div className="grid gap-5">
          <p className="max-w-prose text-[13px] text-text-3">
            Manage your organization profile, booking rules, pricing, payments, email sender, and
            assistant. Pick a section below — each one explains what it controls.
          </p>
          <OrgScopeSelector />
          <SettingsSubNav />
          {children}
        </div>
      </AppShell>
    </OwnerOrgProvider>
  );
}
