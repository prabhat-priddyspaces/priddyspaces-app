"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CalendarBoard, ViewMode, computeWindow } from "@/components/calendar/calendar-board";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { CalendarResponse, CalendarSpace, startOfDay } from "@/lib/calendar";

interface LocationOption {
  public_id: string;
  name: string;
}

function mergeLocations(current: LocationOption[], spaces: CalendarSpace[]): LocationOption[] {
  const merged = new Map(current.map((location) => [location.public_id, location]));
  for (const space of spaces) {
    if (!merged.has(space.location_public_id)) {
      merged.set(space.location_public_id, {
        public_id: space.location_public_id,
        name: space.location_name,
      });
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export default function MemberCalendarPage() {
  const [view, setView] = useState<ViewMode>("day");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [locationPublicId, setLocationPublicId] = useState("");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calendarWindow = useMemo(() => computeWindow(view, anchor), [view, anchor]);
  const windowStartIso = calendarWindow.start.toISOString();
  const windowEndIso = calendarWindow.end.toISOString();

  const load = useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("start", windowStartIso);
    params.set("end", windowEndIso);
    if (locationPublicId) params.set("location_public_id", locationPublicId);
    try {
      const resp = await apiFetch<CalendarResponse>(
        `/api/me/calendar?${params.toString()}`,
        { method: "GET" },
        token
      );
      setData(resp);
      setLocations((current) => mergeLocations(current, resp.spaces));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [windowStartIso, windowEndIso, locationPublicId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-textPrimary">My Calendar</h2>
        <p className="text-textSecondary">
          Your bookings and active memberships across every coworking space you use.
        </p>
      </div>
      {error ? <div className="text-sm text-error">{error}</div> : null}
      {locations.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3">
          <label className="text-xs text-textMuted" htmlFor="member-calendar-location">
            Location
          </label>
          <select
            id="member-calendar-location"
            data-testid="member-calendar-location-filter"
            value={locationPublicId}
            onChange={(event) => setLocationPublicId(event.target.value)}
            className="h-9 rounded-sm border border-border bg-white px-2 text-sm text-textPrimary"
          >
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location.public_id} value={location.public_id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <CalendarBoard
        view={view}
        setView={setView}
        anchor={anchor}
        setAnchor={setAnchor}
        data={data}
        loading={loading}
        filters={null}
        showFilters={false}
        viewer="member"
        onChanged={load}
      />
    </div>
  );
}
