"use client";

import { Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  WORKING_DAYS,
  defaultWorkingHours,
  normalizeWorkingHours,
  workingDayLabel,
} from "@/lib/working-hours";
import type { PublicWorkingHour } from "@/lib/working-hours";

interface WorkingHoursEditorProps {
  enabled: boolean;
  hours: PublicWorkingHour[];
  onChange: (next: { enabled: boolean; hours: PublicWorkingHour[] }) => void;
}

export function WorkingHoursEditor({ enabled, hours, onChange }: WorkingHoursEditorProps) {
  const normalizedHours = normalizeWorkingHours(hours.length > 0 ? hours : defaultWorkingHours());
  const visibleRows = normalizedHours.filter((hour) => hour.enabled);

  function updateEnabled(nextEnabled: boolean) {
    onChange({ enabled: nextEnabled, hours: normalizedHours });
  }

  function toggleDay(day: PublicWorkingHour["day"]) {
    const nextHours = normalizedHours.map((hour) => {
      if (hour.day !== day) {
        return hour;
      }
      if (hour.enabled) {
        return { ...hour, enabled: false };
      }
      return {
        ...hour,
        enabled: true,
        start_time: hour.start_time || "09:00",
        end_time: hour.end_time || "17:00",
      };
    });
    onChange({ enabled, hours: nextHours });
  }

  function updateTime(day: PublicWorkingHour["day"], field: "start_time" | "end_time", value: string) {
    onChange({
      enabled,
      hours: normalizedHours.map((hour) => (hour.day === day ? { ...hour, [field]: value } : hour)),
    });
  }

  return (
    <div className="grid gap-5">
      <label className="flex items-start gap-4">
        <span
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4",
            enabled ? "border-[#0d669a]" : "border-slate-300",
          )}
        >
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-sm border",
              enabled ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-transparent",
            )}
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => updateEnabled(event.target.checked)}
              className="sr-only"
            />
            <Check className="h-6 w-6" aria-hidden="true" />
          </span>
        </span>
        <span className="min-w-0 pt-2">
          <span className="block text-xl font-medium text-textPrimary">Enable working hours</span>
          <span className="mt-1 block text-sm text-textSecondary">
            Working hours appear on public marketplace pages for this location.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap gap-3" role="group" aria-label="Working days">
        {WORKING_DAYS.map(({ day, label, shortLabel }) => {
          const active = normalizedHours.some((hour) => hour.day === day && hour.enabled);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={active}
              title={label}
              onClick={() => toggleDay(day)}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full text-base font-semibold transition",
                active ? "bg-blue-700 text-white" : "bg-slate-200 text-blue-700 hover:bg-slate-300",
                !enabled && "opacity-60",
              )}
              disabled={!enabled}
            >
              {shortLabel}
            </button>
          );
        })}
      </div>

      {enabled && visibleRows.length > 0 ? (
        <div className="grid gap-3">
          <div className="text-center text-sm font-semibold uppercase text-textPrimary">Working Hours</div>
          <div className="grid gap-3">
            {visibleRows.map((hour) => (
              <div
                key={hour.day}
                className="grid items-center gap-3 sm:grid-cols-[minmax(110px,1fr)_minmax(128px,180px)_auto_minmax(128px,180px)]"
              >
                <div className="text-lg text-textPrimary">{workingDayLabel(hour.day)}</div>
                <Input
                  type="time"
                  value={hour.start_time || "09:00"}
                  onChange={(event) => updateTime(hour.day, "start_time", event.target.value)}
                  className="h-14 border-0 bg-slate-100 text-center text-lg"
                  aria-label={`${workingDayLabel(hour.day)} start time`}
                />
                <div className="text-center text-lg text-textPrimary">to</div>
                <Input
                  type="time"
                  value={hour.end_time || "17:00"}
                  onChange={(event) => updateTime(hour.day, "end_time", event.target.value)}
                  className="h-14 border-0 bg-slate-100 text-center text-lg"
                  aria-label={`${workingDayLabel(hour.day)} end time`}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
