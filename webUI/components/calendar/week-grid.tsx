"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import {
  CalendarEvent,
  addDays,
  formatTime,
  isoDateOnly,
  startOfDay,
  statusEventClass,
} from "@/lib/calendar";

interface WeekGridProps {
  windowStart: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

const HOUR_HEIGHT_PX = 36;

export function WeekGrid({ windowStart, events, onEventClick }: WeekGridProps) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfDay(windowStart), i)), [windowStart]);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

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

  return (
    <div className="overflow-auto rounded-md border border-border bg-surface">
      <div className="flex min-w-[800px]">
        <div className="sticky left-0 z-20 shrink-0 border-r border-border bg-surface" style={{ width: 64 }}>
          <div className="h-10 border-b border-border bg-surface2" />
          {hours.map((h) => (
            <div
              key={h}
              className="px-2 text-right text-[11px] text-textMuted border-b border-border"
              style={{ height: HOUR_HEIGHT_PX }}
            >
              {h}:00
            </div>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-7">
          {days.map((day) => {
            const key = isoDateOnly(day);
            const dayStart = day.getTime();
            const dayEvents = eventsByDay.get(key) ?? [];
            const today = new Date();
            const isToday = isoDateOnly(today) === key;
            return (
              <div key={key} className="relative border-r border-border last:border-r-0">
                <div
                  className={cn(
                    "h-10 border-b border-border bg-surface2 px-2 text-xs font-medium flex items-center justify-center",
                    isToday && "text-accent"
                  )}
                >
                  {day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                </div>
                {hours.map((h) => (
                  <div
                    key={h}
                    className="border-b border-border"
                    style={{ height: HOUR_HEIGHT_PX }}
                  />
                ))}
                {dayEvents.map((event) => {
                  const startMs = new Date(event.start).getTime();
                  const endMs = new Date(event.end).getTime();
                  const startMinutes = Math.max(0, (startMs - dayStart) / (60 * 1000));
                  const durationMinutes = Math.max(15, (endMs - startMs) / (60 * 1000));
                  const top = 40 + (startMinutes / 60) * HOUR_HEIGHT_PX;
                  const height = (durationMinutes / 60) * HOUR_HEIGHT_PX;
                  return (
                    <button
                      key={`${event.kind}-${event.public_id}`}
                      type="button"
                      data-testid={`calendar-event-${event.public_id}`}
                      onClick={() => onEventClick?.(event)}
                      className={cn(
                        "absolute left-1 right-1 overflow-hidden rounded-sm border px-1 text-left text-[11px] leading-tight hover:opacity-90",
                        statusEventClass(event.status)
                      )}
                      style={{ top, height: Math.max(height, 18) }}
                      title={`${event.member.name} · ${event.space_name ?? ""}`}
                    >
                      <div className="truncate font-semibold">{event.member.name}</div>
                      <div className="truncate">{event.space_name ?? "—"}</div>
                      <div className="truncate text-[10px]">
                        {formatTime(event.start, null)}–{formatTime(event.end, null)}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
