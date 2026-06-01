"use client";

import { ReactNode, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { CalendarFilterBar, CalendarFilters } from "@/components/calendar/calendar-filter-bar";
import { EventList } from "@/components/calendar/event-list";
import { EventQuickActionPopover } from "@/components/calendar/event-quick-action-popover";
import { MonthGrid } from "@/components/calendar/month-grid";
import { PersonalDayGrid } from "@/components/calendar/personal-day-grid";
import { ResourceTimeline } from "@/components/calendar/resource-timeline";
import { WeekGrid } from "@/components/calendar/week-grid";
import {
  CalendarEvent,
  CalendarResponse,
  CalendarSlotGroup,
  addDays,
  endOfMonth,
  isoDateOnly,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "@/lib/calendar";
import { cn } from "@/lib/utils";

export type ViewMode = "day" | "week" | "month" | "timeline" | "list";

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "timeline", label: "Timeline" },
  { value: "list", label: "List" },
];

export function computeWindow(view: ViewMode, anchor: Date): { start: Date; end: Date } {
  const day = startOfDay(anchor);
  if (view === "day") return { start: day, end: addDays(day, 1) };
  if (view === "timeline") return { start: day, end: addDays(day, 3) };
  if (view === "week") {
    const start = startOfWeek(day);
    return { start, end: addDays(start, 7) };
  }
  if (view === "month") {
    return { start: startOfMonth(day), end: endOfMonth(day) };
  }
  return { start: day, end: addDays(day, 7) };
}

export function shiftAnchor(view: ViewMode, anchor: Date, direction: -1 | 1): Date {
  if (view === "day" || view === "timeline" || view === "list") {
    return addDays(anchor, direction * (view === "timeline" ? 3 : view === "list" ? 7 : 1));
  }
  if (view === "week") return addDays(anchor, direction * 7);
  const d = new Date(anchor);
  d.setMonth(d.getMonth() + direction);
  return d;
}

interface CalendarBoardProps {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  anchor: Date;
  setAnchor: (d: Date) => void;
  data: CalendarResponse | null;
  loading: boolean;
  filters: CalendarFilters | null;
  setFilters?: (f: CalendarFilters) => void;
  filterLocations?: { public_id: string; name: string }[];
  showFilters?: boolean;
  viewer: "owner" | "admin" | "member";
  memberHref?: (id: string) => string;
  onChanged: () => void;
  headerExtra?: ReactNode;
}

export function CalendarBoard({
  view,
  setView,
  anchor,
  setAnchor,
  data,
  loading,
  filters,
  setFilters,
  filterLocations,
  showFilters = true,
  viewer,
  memberHref,
  onChanged,
  headerExtra,
}: CalendarBoardProps) {
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlotGroup | null>(null);
  const window = useMemo(() => computeWindow(view, anchor), [view, anchor]);

  const filteredEvents = useMemo(() => {
    if (!data) return [];
    const term = filters?.memberSearch.trim().toLowerCase() || "";
    if (!term) return data.events;
    return data.events.filter(
      (e) =>
        e.member.name.toLowerCase().includes(term) ||
        e.member.email.toLowerCase().includes(term)
    );
  }, [data, filters?.memberSearch]);

  const displaySpaces = useMemo(() => {
    if (!data) return [];
    if (viewer !== "member") return data.spaces;
    const eventSpaceIds = new Set(filteredEvents.map((event) => event.space_public_id));
    return data.spaces.filter((space) => eventSpaceIds.has(space.public_id));
  }, [data, filteredEvents, viewer]);

  const headerLabel = useMemo(() => {
    if (view === "month") {
      return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    }
    return `${window.start.toLocaleDateString()} → ${addDays(window.end, -1).toLocaleDateString()}`;
  }, [anchor, view, window]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {headerExtra}
        {VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setView(opt.value)}
            className={cn(
              "rounded-sm border px-3 py-1.5 text-xs",
              view === opt.value
                ? "border-accent bg-accent text-white"
                : "border-border bg-surface text-textSecondary hover:border-accent/50"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {showFilters && filters && setFilters && filterLocations ? (
        <CalendarFilterBar
          locations={filterLocations}
          spaces={data?.spaces ?? []}
          filters={filters}
          onChange={setFilters}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setAnchor(shiftAnchor(view, anchor, -1))}>
            ← Prev
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAnchor(startOfDay(new Date()))}>
            Today
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}>
            Next →
          </Button>
          <input
            type="date"
            data-testid="calendar-date-input"
            value={isoDateOnly(anchor)}
            onChange={(e) => {
              if (!e.target.value) return;
              const parts = e.target.value.split("-").map((n) => parseInt(n, 10));
              setAnchor(new Date(parts[0], parts[1] - 1, parts[2]));
            }}
            className="h-8 rounded-sm border border-border bg-white px-2 text-xs text-textPrimary"
          />
          <span className="text-sm text-textSecondary">{headerLabel}</span>
        </div>
        <div className="text-xs text-textMuted">
          {loading ? "Loading…" : data ? `${filteredEvents.length} events` : ""}
          {data?.truncated ? " · result truncated, narrow filters" : ""}
        </div>
      </div>

      {!data ? (
        <div className="rounded-md border border-border bg-surface p-8 text-center text-sm text-textMuted">
          {loading ? "Loading calendar…" : "No bookings or memberships match this calendar view."}
        </div>
      ) : view === "month" ? (
        <MonthGrid windowStart={anchor} events={filteredEvents} onEventClick={setSelected} />
      ) : view === "week" ? (
        <WeekGrid windowStart={window.start} events={filteredEvents} onEventClick={setSelected} />
      ) : view === "list" ? (
        <EventList events={filteredEvents} onEventClick={setSelected} />
      ) : viewer === "member" && view === "day" ? (
        <PersonalDayGrid
          windowStart={window.start}
          spaces={data.spaces}
          events={filteredEvents}
          onEventClick={setSelected}
        />
      ) : (
        <ResourceTimeline
          windowStart={window.start}
          windowEnd={window.end}
          spaces={displaySpaces}
          events={filteredEvents}
          onEventClick={setSelected}
          onSlotClick={setSelectedSlot}
          groupSlots={viewer !== "member"}
        />
      )}

      {selected || selectedSlot ? (
        <EventQuickActionPopover
          event={selected}
          slot={selectedSlot}
          viewer={viewer}
          memberHref={memberHref}
          onClose={() => {
            setSelected(null);
            setSelectedSlot(null);
          }}
          onChanged={() => {
            setSelected(null);
            setSelectedSlot(null);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}
