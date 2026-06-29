"use client";

import * as React from "react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

export interface OwnerOrg {
  public_id: string;
  name: string;
  branding: string | null;
  review_status: string;
  review_notes: string | null;
}

interface OwnerOrgContextValue {
  orgs: OwnerOrg[];
  orgId: string;
  setOrgId: (id: string) => void;
  selectedOrg: OwnerOrg | null;
  loading: boolean;
  error: string | null;
  /** Re-fetch the org list (e.g. after editing the profile) without losing the current selection. */
  refreshOrgs: () => Promise<void>;
}

const OwnerOrgContext = React.createContext<OwnerOrgContextValue | null>(null);

/**
 * Loads the owner's organizations once and shares the selected org across every
 * settings sub-page. Lives in `owner/settings/layout.tsx` so the selection
 * persists as the user moves between sections (the layout is not remounted on
 * navigation, unlike each page). Replaces the duplicated `/api/orgs`
 * load-and-default-to-first block that previously lived in every settings page.
 */
export function OwnerOrgProvider({ children }: { children: React.ReactNode }) {
  const [orgs, setOrgs] = React.useState<OwnerOrg[]>([]);
  const [orgId, setOrgId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refreshOrgs = React.useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<OwnerOrg[]>("/api/orgs", { method: "GET" }, token);
    setOrgs(list);
    if (list.length > 0) {
      setOrgId((current) => current || list[0].public_id);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    refreshOrgs()
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load organizations");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshOrgs]);

  const selectedOrg = React.useMemo(
    () => orgs.find((org) => org.public_id === orgId) ?? null,
    [orgs, orgId]
  );

  const value = React.useMemo<OwnerOrgContextValue>(
    () => ({ orgs, orgId, setOrgId, selectedOrg, loading, error, refreshOrgs }),
    [orgs, orgId, selectedOrg, loading, error, refreshOrgs]
  );

  return <OwnerOrgContext.Provider value={value}>{children}</OwnerOrgContext.Provider>;
}

export function useOwnerOrg(): OwnerOrgContextValue {
  const ctx = React.useContext(OwnerOrgContext);
  if (!ctx) {
    throw new Error("useOwnerOrg must be used within an OwnerOrgProvider");
  }
  return ctx;
}
