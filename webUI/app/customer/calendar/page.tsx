"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CalendarBoard, ViewMode, computeWindow } from "@/components/calendar/calendar-board";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { CalendarResponse, startOfDay } from "@/lib/calendar";

export default function CustomerCalendarPage() {
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const window = useMemo(() => computeWindow(view, anchor), [view, anchor]);

  const load = useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("start", window.start.toISOString());
    params.set("end", window.end.toISOString());
    try {
      const resp = await apiFetch<CalendarResponse>(
        `/api/me/calendar?${params.toString()}`,
        { method: "GET" },
        token
      );
      setData(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [window.start.getTime(), window.end.getTime()]);

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
      <CalendarBoard
        view={view}
        setView={setView}
        anchor={anchor}
        setAnchor={setAnchor}
        data={data}
        loading={loading}
        filters={null}
        showFilters={false}
        viewer="customer"
        onChanged={load}
      />
    </div>
  );
}
