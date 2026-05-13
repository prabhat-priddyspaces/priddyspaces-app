"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type TimelineTone = "violet" | "mint" | "pending" | "warning" | "muted";

export interface TimelineEvent {
  start: number;
  width: number;
  label: string;
  tone?: TimelineTone;
}

export interface TimelineRoom {
  name: string;
  type: string;
  events: TimelineEvent[];
}

const toneStyles: Record<TimelineTone, { bg: string; fg: string; border: string }> = {
  violet: { bg: "var(--ps-violet-100)", fg: "var(--ps-violet-700)", border: "var(--brand)" },
  mint: { bg: "var(--ps-mint-100)", fg: "var(--ps-mint-700)", border: "var(--ps-mint-500)" },
  pending: { bg: "var(--ps-warning-bg)", fg: "var(--ps-warning)", border: "var(--ps-warning)" },
  warning: { bg: "var(--ps-warning-bg)", fg: "var(--ps-warning)", border: "var(--ps-warning)" },
  muted: { bg: "var(--surface-2)", fg: "var(--text-4)", border: "var(--text-4)" },
};

const HOURS = ["8a", "10a", "12p", "2p", "4p", "6p"];

export interface TimelineMiniProps {
  rooms: TimelineRoom[];
  /** Position of the "now" line, 0..1. Omit to hide. */
  now?: number;
  className?: string;
}

export function TimelineMini({ rooms, now = 0.37, className }: TimelineMiniProps) {
  return (
    <div className={className}>
      <div className="grid grid-cols-[120px_1fr] gap-3 mb-1.5">
        <div />
        <div className="relative h-4">
          {HOURS.map((h, i) => (
            <div
              key={h}
              className="font-mono absolute text-[10px] text-text-3"
              style={{
                left: `${(i / (HOURS.length - 1)) * 100}%`,
                transform: "translateX(-50%)",
              }}
            >
              {h}
            </div>
          ))}
          {now != null && (
            <div
              className="absolute top-4 w-[2px] bg-brand z-[2] opacity-60"
              style={{ left: `${now * 100}%`, height: rooms.length * 36 }}
            />
          )}
        </div>
      </div>
      {rooms.map((room, ri) => (
        <div key={ri} className="grid grid-cols-[120px_1fr] gap-3 mb-1">
          <div className="flex flex-col justify-center">
            <div className="text-[12px] font-medium">{room.name}</div>
            <div className="text-[10px] text-text-3">{room.type}</div>
          </div>
          <div className="relative h-8 bg-surface-2 rounded-lg overflow-hidden">
            {[0.2, 0.4, 0.6, 0.8].map((p) => (
              <div
                key={p}
                className="absolute top-0 bottom-0 w-px bg-bg"
                style={{ left: `${p * 100}%` }}
              />
            ))}
            {room.events.map((event, ei) => {
              const tone = toneStyles[event.tone ?? "muted"];
              return (
                <div
                  key={ei}
                  className={cn(
                    "absolute top-[3px] bottom-[3px] rounded-md text-[10px] font-semibold flex items-center px-2 whitespace-nowrap overflow-hidden text-ellipsis"
                  )}
                  style={{
                    left: `${event.start * 100}%`,
                    width: `${event.width * 100}%`,
                    background: tone.bg,
                    color: tone.fg,
                    borderLeft: `3px solid ${tone.border}`,
                  }}
                  title={event.label}
                >
                  {event.label}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
