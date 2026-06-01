"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import {
  CalendarEvent,
  CalendarSlotGroup,
  CalendarSpace,
  SPACE_TYPE_LABEL,
  formatTime,
  groupCalendarSlotEvents,
  slotEventClass,
  statusEventClass,
} from "@/lib/calendar";

interface ResourceTimelineProps {
  windowStart: Date;
  windowEnd: Date;
  spaces: CalendarSpace[];
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onSlotClick?: (slot: CalendarSlotGroup) => void;
  groupSlots?: boolean;
}

const HOUR_PX = 60;
const ROW_HEIGHT_PX = 56;
const RESOURCE_COL_PX = 240;

export function ResourceTimeline({
  windowStart,
  windowEnd,
  spaces,
  events,
  onEventClick,
  onSlotClick,
  groupSlots = false,
}: ResourceTimelineProps) {
  const totalMs = windowEnd.getTime() - windowStart.getTime();
  const totalHours = Math.max(1, Math.round(totalMs / (60 * 60 * 1000)));
  const trackWidth = totalHours * HOUR_PX;

  const eventsBySpace = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const list = map.get(event.space_public_id) ?? [];
      list.push(event);
      map.set(event.space_public_id, list);
    }
    return map;
  }, [events]);
  const slotsBySpace = useMemo(() => {
    const map = new Map<string, CalendarSlotGroup[]>();
    for (const slot of groupCalendarSlotEvents(events, spaces)) {
      const list = map.get(slot.space_public_id) ?? [];
      list.push(slot);
      map.set(slot.space_public_id, list);
    }
    return map;
  }, [events, spaces]);

  const tickHours = useMemo(() => {
    const ticks: Date[] = [];
    const step = totalHours <= 24 ? 1 : totalHours <= 24 * 3 ? 3 : 6;
    const start = new Date(windowStart);
    start.setMinutes(0, 0, 0);
    for (let h = 0; h <= totalHours; h += step) {
      ticks.push(new Date(start.getTime() + h * 60 * 60 * 1000));
    }
    return ticks;
  }, [totalHours, windowStart]);

  if (spaces.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-8 text-center text-sm text-textMuted">
        No spaces match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-md border border-border bg-surface">
      <div className="flex" style={{ minWidth: RESOURCE_COL_PX + trackWidth }}>
        {/* Sticky resource column */}
        <div
          className="sticky left-0 z-20 shrink-0 border-r border-border bg-surface"
          style={{ width: RESOURCE_COL_PX }}
        >
          <div
            className="border-b border-border bg-surface2 px-3 text-xs font-semibold uppercase tracking-wide text-textMuted flex items-center"
            style={{ height: 36 }}
          >
            Space
          </div>
          {spaces.map((space) => (
            <div
              key={space.public_id}
              className="border-b border-border px-3 flex flex-col justify-center"
              style={{ height: ROW_HEIGHT_PX }}
            >
              <div className="truncate text-sm font-medium text-textPrimary">
                {space.name || "Unnamed space"}
              </div>
              <div className="truncate text-xs text-textMuted">
                {SPACE_TYPE_LABEL[space.space_type] ?? space.space_type} · {space.location_name}
              </div>
            </div>
          ))}
        </div>

        {/* Time axis + event tracks */}
        <div className="relative flex-1" style={{ minWidth: trackWidth }}>
          {/* Hour ticks header */}
          <div
            className="sticky top-0 z-10 flex border-b border-border bg-surface2 text-xs text-textMuted"
            style={{ height: 36 }}
          >
            {tickHours.map((tick, idx) => {
              const offsetMs = tick.getTime() - windowStart.getTime();
              const left = (offsetMs / totalMs) * trackWidth;
              return (
                <div
                  key={idx}
                  className="absolute top-0 bottom-0 flex items-center pl-1"
                  style={{ left }}
                >
                  <span className="border-l border-border pl-1">
                    {formatTime(tick.toISOString(), null)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Vertical grid lines (background) */}
          <div className="absolute inset-x-0 top-9 bottom-0 pointer-events-none">
            {tickHours.map((tick, idx) => {
              const offsetMs = tick.getTime() - windowStart.getTime();
              const left = (offsetMs / totalMs) * trackWidth;
              return (
                <div
                  key={idx}
                  className="absolute top-0 bottom-0 border-l border-dashed border-border/60"
                  style={{ left }}
                />
              );
            })}
          </div>

          {/* Rows */}
          {spaces.map((space) => {
            const spaceEvents = eventsBySpace.get(space.public_id) ?? [];
            return (
              <div
                key={space.public_id}
                className="relative border-b border-border"
                style={{ height: ROW_HEIGHT_PX }}
              >
                {groupSlots
                  ? (slotsBySpace.get(space.public_id) ?? []).map((slot) => {
                  const startMs = new Date(slot.start).getTime();
                  const endMs = new Date(slot.end).getTime();
                  const clampedStart = Math.max(startMs, windowStart.getTime());
                  const clampedEnd = Math.min(endMs, windowEnd.getTime());
                  if (clampedEnd <= clampedStart) return null;
                  const left = ((clampedStart - windowStart.getTime()) / totalMs) * trackWidth;
                  const width = ((clampedEnd - clampedStart) / totalMs) * trackWidth;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      data-testid={`calendar-slot-${slot.id}`}
                      onClick={() => onSlotClick?.(slot)}
                      className={cn(
                        "absolute top-1 bottom-1 overflow-hidden rounded-sm border px-2 text-left text-xs leading-tight transition hover:opacity-90",
                        slotEventClass(slot.tone)
                      )}
                      style={{ left, width: Math.max(width, 24) }}
                      title={`${slot.space_name || "Slot"} · ${slot.label}`}
                    >
                      <div className="truncate font-semibold">{slot.label}</div>
                      <div className="truncate">
                        {formatTime(slot.start, space.location_timezone)}–
                        {formatTime(slot.end, space.location_timezone)}
                        {slot.detailLabel ? ` · ${slot.detailLabel}` : ""}
                      </div>
                    </button>
                  );
                })
                  : spaceEvents.map((event) => {
                      const startMs = new Date(event.start).getTime();
                      const endMs = new Date(event.end).getTime();
                      const clampedStart = Math.max(startMs, windowStart.getTime());
                      const clampedEnd = Math.min(endMs, windowEnd.getTime());
                      if (clampedEnd <= clampedStart) return null;
                      const left = ((clampedStart - windowStart.getTime()) / totalMs) * trackWidth;
                      const width = ((clampedEnd - clampedStart) / totalMs) * trackWidth;
                      return (
                        <button
                          key={`${event.kind}-${event.public_id}`}
                          type="button"
                          data-testid={`calendar-event-${event.public_id}`}
                          onClick={() => onEventClick?.(event)}
                          className={cn(
                            "absolute top-1 bottom-1 overflow-hidden rounded-sm border px-2 text-left text-xs leading-tight transition hover:opacity-90",
                            statusEventClass(event.status)
                          )}
                          style={{ left, width: Math.max(width, 24) }}
                          title={`${event.member.name} · ${event.status}`}
                        >
                          <div className="truncate font-semibold">{event.member.name}</div>
                          <div className="truncate">
                            {formatTime(event.start, space.location_timezone)}–
                            {formatTime(event.end, space.location_timezone)}
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
