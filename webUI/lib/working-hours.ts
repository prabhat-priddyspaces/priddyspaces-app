export type WorkingDay =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export interface PublicWorkingHour {
  day: WorkingDay;
  enabled: boolean;
  start_time: string | null;
  end_time: string | null;
}

export const WORKING_DAYS: Array<{ day: WorkingDay; label: string; shortLabel: string }> = [
  { day: "sunday", label: "Sunday", shortLabel: "S" },
  { day: "monday", label: "Monday", shortLabel: "M" },
  { day: "tuesday", label: "Tuesday", shortLabel: "T" },
  { day: "wednesday", label: "Wednesday", shortLabel: "W" },
  { day: "thursday", label: "Thursday", shortLabel: "T" },
  { day: "friday", label: "Friday", shortLabel: "F" },
  { day: "saturday", label: "Saturday", shortLabel: "S" },
];

const DEFAULT_START_TIME = "09:00";
const DEFAULT_END_TIME = "17:00";

export function defaultWorkingHours(): PublicWorkingHour[] {
  return WORKING_DAYS.map(({ day }) => {
    const enabled = day !== "sunday" && day !== "saturday";
    return {
      day,
      enabled,
      start_time: enabled ? DEFAULT_START_TIME : null,
      end_time: enabled ? DEFAULT_END_TIME : null,
    };
  });
}

export function normalizeWorkingHours(hours: PublicWorkingHour[] | null | undefined): PublicWorkingHour[] {
  const byDay = new Map((hours || []).map((hour) => [hour.day, hour]));
  return WORKING_DAYS.map(({ day }) => {
    const current = byDay.get(day);
    return {
      day,
      enabled: Boolean(current?.enabled),
      start_time: current?.start_time || null,
      end_time: current?.end_time || null,
    };
  });
}

export function visibleWorkingHours(
  enabled: boolean | null | undefined,
  hours: PublicWorkingHour[] | null | undefined,
) {
  if (!enabled) {
    return [];
  }
  return normalizeWorkingHours(hours).filter((hour) => hour.enabled && hour.start_time && hour.end_time);
}

export function workingDayLabel(day: WorkingDay) {
  return WORKING_DAYS.find((item) => item.day === day)?.label || day;
}

export function formatWorkingHourTime(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const [hourText, minuteText] = value.slice(0, 5).split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return value;
  }
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}
