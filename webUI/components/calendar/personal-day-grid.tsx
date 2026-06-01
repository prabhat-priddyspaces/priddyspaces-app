"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import {
  CalendarEvent,
  CalendarSpace,
  formatTime,
  isoDateOnly,
  statusEventClass,
} from "@/lib/calendar";

interface PersonalDayGridProps {
  windowStart: Date;
  spaces: CalendarSpace[];
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

const HOUR_HEIGHT_PX = 48;
const HEADER_HEIGHT_PX = 40;
const TIME_COL_PX = 72;

interface ZonedParts {
  dateKey: string;
  minutes: number;
}

function zonedParts(iso: string, timezone: string | null | undefined): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "0";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    dateKey: `${year}-${month}-${day}`,
    minutes: hour * 60 + minute,
  };
}

export function PersonalDayGrid({
  windowStart,
  spaces,
  events,
  onEventClick,
}: PersonalDayGridProps) {
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const spaceById = useMemo(
    () => new Map(spaces.map((space) => [space.public_id, space])),
    [spaces]
  );

  const positionedEvents = useMemo(() => {
    const selectedDateKey = isoDateOnly(windowStart);
    const sorted = events
      .filter((event) => {
        const space = spaceById.get(event.space_public_id);
        const start = zonedParts(event.start, space?.location_timezone);
        const end = zonedParts(event.end, space?.location_timezone);
        return start.dateKey <= selectedDateKey && end.dateKey >= selectedDateKey;
      })
      .sort((a, b) => {
        const aSpace = spaceById.get(a.space_public_id);
        const bSpace = spaceById.get(b.space_public_id);
        const aStart = zonedParts(a.start, aSpace?.location_timezone);
        const bStart = zonedParts(b.start, bSpace?.location_timezone);
        return aStart.minutes - bStart.minutes;
      });

    const laneEnds: number[] = [];
    const positioned = sorted.map((event) => {
      const space = spaceById.get(event.space_public_id);
      const start = zonedParts(event.start, space?.location_timezone);
      const end = zonedParts(event.end, space?.location_timezone);
      const startMinutes = start.dateKey < selectedDateKey ? 0 : start.minutes;
      const endMinutes = end.dateKey > selectedDateKey ? 24 * 60 : end.minutes;
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= startMinutes);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(endMinutes);
      } else {
        laneEnds[lane] = endMinutes;
      }
      return { event, lane, startMinutes, endMinutes };
    });

    return { items: positioned, laneCount: Math.max(1, laneEnds.length) };
  }, [events, spaceById, windowStart]);

  return (
    <div
      data-testid="member-day-grid"
      className="overflow-auto rounded-md border border-border bg-white"
    >
      <div className="flex min-w-[680px]">
        <div
          className="sticky left-0 z-20 shrink-0 border-r border-border bg-white"
          style={{ width: TIME_COL_PX }}
        >
          <div
            className="border-b border-border bg-surface2"
            style={{ height: HEADER_HEIGHT_PX }}
          />
          {hours.map((hour) => (
            <div
              key={hour}
              data-testid={`member-day-hour-${hour}`}
              className="border-b border-border px-2 text-right text-[11px] text-textMuted"
              style={{ height: HOUR_HEIGHT_PX }}
            >
              {hour}:00
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="sticky top-0 z-10 flex items-center border-b border-border bg-surface2 px-3 text-xs font-semibold uppercase tracking-wide text-textMuted"
            style={{ height: HEADER_HEIGHT_PX }}
          >
            My schedule
          </div>
          <div className="relative" style={{ height: HOUR_HEIGHT_PX * 24 }}>
            {hours.map((hour) => (
              <div
                key={hour}
                className="border-b border-border"
                style={{ height: HOUR_HEIGHT_PX }}
              />
            ))}
            {positionedEvents.items.length === 0 ? (
              <div className="absolute left-4 top-4 text-sm text-textMuted">
                No bookings match this day.
              </div>
            ) : null}
            {positionedEvents.items.map(({ event, lane, startMinutes, endMinutes }) => {
              const durationMinutes = Math.max(15, endMinutes - startMinutes);
              const top = (startMinutes / 60) * HOUR_HEIGHT_PX;
              const height = (durationMinutes / 60) * HOUR_HEIGHT_PX;
              const laneWidth = 100 / positionedEvents.laneCount;
              const left = lane * laneWidth;
              const space = spaceById.get(event.space_public_id);
              const timezone = space?.location_timezone;

              return (
                <button
                  key={`${event.kind}-${event.public_id}`}
                  type="button"
                  data-testid={`calendar-event-${event.public_id}`}
                  onClick={() => onEventClick?.(event)}
                  className={cn(
                    "absolute overflow-hidden rounded-sm border px-2 py-1 text-left text-xs leading-tight transition hover:opacity-90",
                    statusEventClass(event.status)
                  )}
                  style={{
                    top,
                    height: Math.max(height, 32),
                    left: `calc(${left}% + 6px)`,
                    width: `calc(${laneWidth}% - 10px)`,
                  }}
                  title={`${event.space_name ?? "Booking"} · ${event.location_name}`}
                >
                  <div className="truncate font-semibold">{event.space_name || "Booking"}</div>
                  <div className="truncate">{event.location_name}</div>
                  <div className="truncate text-[11px]">
                    {formatTime(event.start, timezone)}-{formatTime(event.end, timezone)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
