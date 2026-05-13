"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import {
  formatDateLong,
  isDayBookable,
  todayIso,
  type OpenInterval,
} from "@/lib/space-availability";
import type { SpaceAvailabilityDay } from "@/lib/public-marketplace";

interface AvailabilityCalendarProps {
  value: string;
  onChange: (date: string) => void;
  days: SpaceAvailabilityDay[];
  open: OpenInterval;
  granularityMinutes: number;
  minDateIso?: string;
}

function startOfMonthIso(isoDate: string): string {
  const [y, m] = isoDate.split("-");
  return `${y}-${m}-01`;
}

function shiftMonth(monthIso: string, delta: number): string {
  const [y, m] = monthIso.split("-").map((part) => parseInt(part, 10));
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function buildMonthGrid(monthIso: string): Array<string | null> {
  const [y, m] = monthIso.split("-").map((part) => parseInt(part, 10));
  const firstDay = new Date(Date.UTC(y, m - 1, 1));
  const startWeekday = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatMonthHeading(monthIso: string): string {
  const [y, m] = monthIso.split("-").map((part) => parseInt(part, 10));
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return dt.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export function AvailabilityCalendar({
  value,
  onChange,
  days,
  open,
  granularityMinutes,
  minDateIso,
}: AvailabilityCalendarProps) {
  const [openPopover, setOpenPopover] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonthIso(value || todayIso()));
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (value) setViewMonth(startOfMonthIso(value));
  }, [value]);

  useEffect(() => {
    if (!openPopover) return;
    function handleClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpenPopover(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openPopover]);

  const dayMap = useMemo(() => {
    const map = new Map<string, SpaceAvailabilityDay>();
    for (const d of days) map.set(d.date, d);
    return map;
  }, [days]);

  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const minIso = minDateIso ?? todayIso();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpenPopover((prev) => !prev)}
        className="flex h-12 w-full items-center justify-between gap-3 rounded-full border border-line bg-surface px-4 text-sm font-medium text-text transition hover:border-line-strong"
      >
        <span className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-text-3" />
          {value ? formatDateLong(value) : "Select a date"}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-text-3 transition-transform ${openPopover ? "rotate-180" : ""}`}
        />
      </button>

      {openPopover ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-2xl border border-line bg-surface p-4 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.45)]">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((prev) => shiftMonth(prev, -1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-3 transition hover:bg-surface-2"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-semibold text-text">
              {formatMonthHeading(viewMonth)}
            </div>
            <button
              type="button"
              onClick={() => setViewMonth((prev) => shiftMonth(prev, 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-3 transition hover:bg-surface-2"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 text-center text-xs font-medium text-text-4">
            {WEEKDAY_LABELS.map((label, idx) => (
              <div key={`${label}-${idx}`} className="py-1">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((iso, idx) => {
              if (!iso) {
                return <div key={`empty-${idx}`} className="h-9" />;
              }
              const day = dayMap.get(iso);
              const dayNum = parseInt(iso.slice(-2), 10);
              const beforeMin = iso < minIso;
              const bookable = !beforeMin && isDayBookable(day, open, granularityMinutes);
              const isSelected = iso === value;

              if (beforeMin || !bookable) {
                return (
                  <div
                    key={iso}
                    className="flex h-9 items-center justify-center rounded-full text-sm text-text-4"
                  >
                    <span className="line-through decoration-line">{dayNum}</span>
                  </div>
                );
              }

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    onChange(iso);
                    setOpenPopover(false);
                  }}
                  className={`h-9 rounded-full text-sm font-medium transition ${
                    isSelected
                      ? "bg-brand text-white"
                      : "text-text hover:bg-surface-2"
                  }`}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-text-3">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-surface-3" />
              Unavailable
            </span>
            <button
              type="button"
              onClick={() => {
                const today = todayIso();
                if (today >= minIso) {
                  setViewMonth(startOfMonthIso(today));
                }
              }}
              className="font-medium text-text-2 hover:text-text"
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
