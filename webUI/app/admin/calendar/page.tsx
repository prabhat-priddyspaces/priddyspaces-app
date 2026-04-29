"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { CalendarFilters } from "@/components/calendar/calendar-filter-bar";
import { CalendarBoard, ViewMode, computeWindow } from "@/components/calendar/calendar-board";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { CalendarResponse, startOfDay } from "@/lib/calendar";

interface OrganizationOption {
  public_id: string;
  name: string;
}

interface LocationOption {
  public_id: string;
  name: string;
  organization_public_id: string;
}

export default function AdminCalendarPage() {
  const [view, setView] = useState<ViewMode>("timeline");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [orgs, setOrgs] = useState<OrganizationOption[]>([]);
  const [orgPublicId, setOrgPublicId] = useState<string>("");
  const [allLocations, setAllLocations] = useState<LocationOption[]>([]);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CalendarFilters>({
    locationPublicId: null,
    spaceTypes: [],
    spacePublicIds: [],
    statuses: [],
    memberSearch: "",
  });

  const window = useMemo(() => computeWindow(view, anchor), [view, anchor]);

  // Load org list (admin sees all). Try a couple of admin endpoints; fall back gracefully.
  useEffect(() => {
    let active = true;
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    apiFetch<{ public_id: string; name: string }[]>(
      "/api/admin/owner-companies",
      { method: "GET" },
      token
    )
      .then((rows) => {
        if (!active) return;
        setOrgs(rows.map((r) => ({ public_id: r.public_id, name: r.name })));
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, []);

  // Filter visible locations to the selected org (or all locations from data response when scope is global).
  const filterLocations = useMemo(() => {
    if (orgPublicId) {
      return allLocations.filter((l) => l.organization_public_id === orgPublicId);
    }
    return allLocations;
  }, [allLocations, orgPublicId]);

  const load = useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("start", window.start.toISOString());
    params.set("end", window.end.toISOString());
    if (orgPublicId) params.set("organization_public_id", orgPublicId);
    if (filters.locationPublicId) params.set("location_public_id", filters.locationPublicId);
    for (const t of filters.spaceTypes) params.append("space_type", t);
    for (const id of filters.spacePublicIds) params.append("space_public_id", id);
    for (const s of filters.statuses) params.append("status", s);
    try {
      const resp = await apiFetch<CalendarResponse>(
        `/api/admin/calendar?${params.toString()}`,
        { method: "GET" },
        token
      );
      setData(resp);
      // Materialize the location list from the calendar response (cheap and avoids a second roundtrip).
      const seen = new Map<string, LocationOption>();
      for (const sp of resp.spaces) {
        if (!seen.has(sp.location_public_id)) {
          seen.set(sp.location_public_id, {
            public_id: sp.location_public_id,
            name: sp.location_name,
            organization_public_id: orgPublicId || "",
          });
        }
      }
      setAllLocations((prev) => {
        // Merge to keep org assignments from earlier loads.
        const merged = new Map(prev.map((l) => [l.public_id, l]));
        for (const [k, v] of seen) {
          if (!merged.has(k)) merged.set(k, v);
        }
        return Array.from(merged.values());
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [window.start.getTime(), window.end.getTime(), filters, orgPublicId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminShell>
      <div className="grid gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-textPrimary">Platform Calendar</h2>
          <p className="text-textSecondary">
            All bookings across every org. Filter by organization or location for support tasks.
          </p>
        </div>
        {error ? <div className="text-sm text-error">{error}</div> : null}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-3">
          <label className="text-xs text-textMuted">Organization</label>
          <select
            value={orgPublicId}
            onChange={(e) => {
              setOrgPublicId(e.target.value);
              setFilters((f) => ({ ...f, locationPublicId: null, spacePublicIds: [] }));
            }}
            className="h-9 rounded-sm border border-border bg-white px-2 text-sm text-textPrimary"
          >
            <option value="">All organizations</option>
            {orgs.map((org) => (
              <option key={org.public_id} value={org.public_id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
        <CalendarBoard
          view={view}
          setView={setView}
          anchor={anchor}
          setAnchor={setAnchor}
          data={data}
          loading={loading}
          filters={filters}
          setFilters={setFilters}
          filterLocations={filterLocations}
          viewer="admin"
          memberHref={(id) => `/admin/customers/${id}`}
          onChanged={load}
        />
      </div>
    </AdminShell>
  );
}
