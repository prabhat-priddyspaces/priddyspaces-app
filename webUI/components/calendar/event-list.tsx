"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import {
  CalendarEvent,
  formatCurrency,
  formatDateTime,
  statusColorClass,
} from "@/lib/calendar";

interface EventListProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

export function EventList({ events, onEventClick }: EventListProps) {
  const sorted = useMemo(
    () => [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [events]
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-8 text-center text-sm text-textMuted">
        No events match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface2 text-xs uppercase tracking-wide text-textMuted">
          <tr>
            <th className="px-3 py-2 text-left">When</th>
            <th className="px-3 py-2 text-left">Member</th>
            <th className="px-3 py-2 text-left">Space</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((event) => (
            <tr
              key={`${event.kind}-${event.public_id}`}
              className="border-t border-border hover:bg-surface2 cursor-pointer"
              onClick={() => onEventClick?.(event)}
            >
              <td className="px-3 py-2 align-top text-textPrimary">
                <div className="font-medium">{formatDateTime(event.start, null)}</div>
                <div className="text-xs text-textMuted">to {formatDateTime(event.end, null)}</div>
              </td>
              <td className="px-3 py-2 align-top">
                <div className="font-medium text-textPrimary">{event.member.name}</div>
                <div className="text-xs text-textMuted">{event.member.email}</div>
              </td>
              <td className="px-3 py-2 align-top text-textPrimary">
                <div>{event.space_name || "—"}</div>
                <div className="text-xs text-textMuted">{event.location_name}</div>
              </td>
              <td className="px-3 py-2 align-top">
                <span
                  className={cn(
                    "inline-flex rounded-sm border px-2 py-0.5 text-xs",
                    statusColorClass(event.status)
                  )}
                >
                  {event.status}
                </span>
              </td>
              <td className="px-3 py-2 align-top text-right text-textPrimary">
                {formatCurrency(event.amount_cents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
