"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import {
  CalendarEvent,
  addDays,
  isoDateOnly,
  startOfDay,
  startOfMonth,
  startOfWeek,
  statusColorClass,
} from "@/lib/calendar";

interface MonthGridProps {
  windowStart: Date; // any date in the desired month
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

const MAX_EVENTS_PER_DAY = 3;

export function MonthGrid({ windowStart, events, onEventClick }: MonthGridProps) {
  const monthStart = useMemo(() => startOfMonth(windowStart), [windowStart]);
  const gridStart = useMemo(() => startOfWeek(monthStart), [monthStart]);
  const days = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)),
    [gridStart]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = isoDateOnly(new Date(event.start));
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const today = isoDateOnly(new Date());
  const monthIndex = monthStart.getMonth();

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border bg-surface2 text-xs font-semibold uppercase tracking-wide text-textMuted">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-2 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((day) => {
          const key = isoDateOnly(day);
          const dayEvents = eventsByDay.get(key) ?? [];
          const inMonth = day.getMonth() === monthIndex;
          const isToday = key === today;
          const visible = dayEvents.slice(0, MAX_EVENTS_PER_DAY);
          const overflow = dayEvents.length - visible.length;
          return (
            <div
              key={key}
              className={cn(
                "min-h-[96px] border-b border-r border-border p-1 text-xs",
                !inMonth && "bg-surface2/50 text-textMuted",
                isToday && "bg-accentSubtle/40"
              )}
            >
              <div className="flex items-center justify-between px-1">
                <span className={cn("font-medium", isToday && "text-accent")}>
                  {day.getDate()}
                </span>
                {dayEvents.length > 0 ? (
                  <span className="text-[10px] text-textMuted">{dayEvents.length}</span>
                ) : null}
              </div>
              <div className="mt-1 grid gap-0.5">
                {visible.map((event) => (
                  <button
                    key={`${event.kind}-${event.public_id}`}
                    type="button"
                    onClick={() => onEventClick?.(event)}
                    className={cn(
                      "truncate rounded-sm border px-1 py-0.5 text-left text-[10px] leading-tight hover:opacity-90",
                      statusColorClass(event.status)
                    )}
                    title={`${event.member.name} · ${event.space_name ?? ""}`}
                  >
                    {event.member.name}
                  </button>
                ))}
                {overflow > 0 ? (
                  <div className="px-1 text-[10px] text-textMuted">+{overflow} more</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
