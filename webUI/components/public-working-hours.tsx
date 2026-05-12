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
    <div className="rounded-[24px] border border-slate-200 bg-white p-5">
      <div className="text-sm font-semibold text-slate-900">Hours</div>
      <div className="mt-4 space-y-3 text-sm text-slate-600">
        {rows.map((row) => (
          <div key={row.day} className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Clock3 className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="font-medium text-slate-900">{workingDayLabel(row.day)}</span>
            </div>
            <span>{formatWorkingHourTime(row.start_time)}</span>
            <span>to {formatWorkingHourTime(row.end_time)}</span>
          </div>
        ))}
        {legacyRows.map((row) => (
          <div key={row} className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-4 w-4 text-slate-400" />
            <span>{row}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
