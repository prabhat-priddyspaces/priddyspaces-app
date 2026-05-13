import { Clock3 } from "lucide-react";

import {
  formatWorkingHourTime,
  visibleWorkingHours,
  workingDayLabel,
} from "@/lib/working-hours";
import type { PublicWorkingHour } from "@/lib/working-hours";

interface PublicWorkingHoursProps {
  enabled?: boolean | null;
  hours?: PublicWorkingHour[] | null;
  legacyWeekdays?: string | null;
  legacyWeekends?: string | null;
}

export function PublicWorkingHours({
  enabled,
  hours,
  legacyWeekdays,
  legacyWeekends,
}: PublicWorkingHoursProps) {
  const rows = visibleWorkingHours(enabled, hours);
  const hasStructuredHours = Array.isArray(hours) && hours.length > 0;
  const legacyRows = hasStructuredHours
    ? []
    : [legacyWeekdays, legacyWeekends].filter((row): row is string => Boolean(row));

  if (rows.length === 0 && legacyRows.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="text-sm font-semibold text-text">Hours</div>
      <div className="mt-4 space-y-3 text-sm text-text-2">
        {rows.map((row) => (
          <div key={row.day} className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Clock3 className="h-4 w-4 shrink-0 text-text-4" />
              <span className="font-medium text-text">{workingDayLabel(row.day)}</span>
            </div>
            <span>{formatWorkingHourTime(row.start_time)}</span>
            <span>to {formatWorkingHourTime(row.end_time)}</span>
          </div>
        ))}
        {legacyRows.map((row) => (
          <div key={row} className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-4 w-4 text-text-4" />
            <span>{row}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
