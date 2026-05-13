"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { CalendarFilters } from "@/components/calendar/calendar-filter-bar";
import { CalendarBoard, ViewMode, computeWindow } from "@/components/calendar/calendar-board";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { CalendarResponse, startOfDay } from "@/lib/calendar";

interface Organization {
  public_id: string;
}

interface Location {
  public_id: string;
  name: string;
}

export default function OwnerCalendarPage() {
  const [view, setView] = useState<ViewMode>("timeline");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [locations, setLocations] = useState<Location[]>([]);
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

  useEffect(() => {
    let active = true;
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token)
      .then(async (orgs) => {
        const out: Location[] = [];
        for (const org of orgs) {
          const locs = await apiFetch<Location[]>(
            `/api/locations?organization_public_id=${org.public_id}`,
            { method: "GET" },
            token
          ).catch(() => []);
          out.push(...locs);
        }
        return out;
      })
      .then((locs) => {
        if (!active) return;
        setLocations(locs);
        if (locs.length === 1) {
          setFilters((f) => ({ ...f, locationPublicId: locs[0].public_id }));
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load locations");
      });
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("start", window.start.toISOString());
    params.set("end", window.end.toISOString());
    if (filters.locationPublicId) params.set("location_public_id", filters.locationPublicId);
    for (const t of filters.spaceTypes) params.append("space_type", t);
    for (const id of filters.spacePublicIds) params.append("space_public_id", id);
    for (const s of filters.statuses) params.append("status", s);
    try {
      const resp = await apiFetch<CalendarResponse>(
        `/api/owner/calendar?${params.toString()}`,
        { method: "GET" },
        token
      );
      setData(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [window.start.getTime(), window.end.getTime(), filters]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell title="Calendar" breadcrumb={["Owner", "Operations"]}>
      <p className="text-[13px] text-text-3 mb-4">
        See bookings, requests, and active memberships across your locations.
      </p>
      {error ? <div className="text-[13px] text-danger mb-4">{error}</div> : null}
      <CalendarBoard
        view={view}
        setView={setView}
        anchor={anchor}
        setAnchor={setAnchor}
        data={data}
        loading={loading}
        filters={filters}
        setFilters={setFilters}
        filterLocations={locations}
        viewer="owner"
        memberHref={(id) => `/owner/members/${id}`}
        onChanged={load}
      />
    </AppShell>
  );
}
