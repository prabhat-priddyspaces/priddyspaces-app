import type {
  SpaceAvailabilityDay,
  SpaceAvailabilityInterval,
  SpaceAvailabilityResponse,
} from "@/lib/public-marketplace";

export const DEFAULT_OPEN_TIME = "09:00";
export const DEFAULT_CLOSE_TIME = "18:00";
export const DEFAULT_GRANULARITY_MINUTES = 30;

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map((part) => parseInt(part, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function minutesToTime(value: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, value));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  if (h === 24) return "24:00";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatTimeLabel(value: string): string {
  const minutes = timeToMinutes(value);
  if (minutes === 24 * 60) return "12:00 am";
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours24 >= 12 ? "pm" : "am";
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  return `${String(hours12).padStart(2, "0")}:${String(mins).padStart(2, "0")} ${period}`;
}

export function formatDateLong(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map((part) => parseInt(part, 10));
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map((part) => parseInt(part, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export interface OpenInterval {
  start: string;
  end: string;
}

export function getDayOpenWindow(
  availability: Pick<
    SpaceAvailabilityResponse,
    "availability_start_time" | "availability_end_time"
  >,
): OpenInterval {
  return {
    start: availability.availability_start_time?.slice(0, 5) ?? DEFAULT_OPEN_TIME,
    end: availability.availability_end_time?.slice(0, 5) ?? DEFAULT_CLOSE_TIME,
  };
}

export function getOpenIntervalsForDay(
  day: SpaceAvailabilityDay | undefined,
  open: OpenInterval,
): OpenInterval[] {
  if (!day || day.fully_blocked) return [];
  const openStart = timeToMinutes(open.start);
  const openEnd = timeToMinutes(open.end);
  if (openEnd <= openStart) return [];

  const busy = (day.busy_intervals ?? [])
    .map((b: SpaceAvailabilityInterval) => ({
      start: Math.max(openStart, timeToMinutes(b.start)),
      end: Math.min(openEnd, timeToMinutes(b.end)),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of busy) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  const open_intervals: OpenInterval[] = [];
  let cursor = openStart;
  for (const b of merged) {
    if (b.start > cursor) {
      open_intervals.push({ start: minutesToTime(cursor), end: minutesToTime(b.start) });
    }
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < openEnd) {
    open_intervals.push({ start: minutesToTime(cursor), end: minutesToTime(openEnd) });
  }
  return open_intervals;
}

export function isDayBookable(
  day: SpaceAvailabilityDay | undefined,
  open: OpenInterval,
  granularityMinutes: number,
): boolean {
  if (!day) return false;
  const intervals = getOpenIntervalsForDay(day, open);
  return intervals.some(
    (i) => timeToMinutes(i.end) - timeToMinutes(i.start) >= granularityMinutes,
  );
}

export function buildSlotOptions(
  intervals: OpenInterval[],
  granularityMinutes: number,
): string[] {
  const slots: string[] = [];
  for (const interval of intervals) {
    const start = timeToMinutes(interval.start);
    const end = timeToMinutes(interval.end);
    for (let t = start; t + granularityMinutes <= end; t += granularityMinutes) {
      slots.push(minutesToTime(t));
    }
  }
  return slots;
}

export function buildEndSlotOptions(
  intervals: OpenInterval[],
  startTime: string,
  granularityMinutes: number,
): string[] {
  const startMinutes = timeToMinutes(startTime);
  const containing = intervals.find(
    (i) => timeToMinutes(i.start) <= startMinutes && startMinutes < timeToMinutes(i.end),
  );
  if (!containing) return [];
  const end = timeToMinutes(containing.end);
  const options: string[] = [];
  for (let t = startMinutes + granularityMinutes; t <= end; t += granularityMinutes) {
    options.push(minutesToTime(t));
  }
  return options;
}

export function findFirstBookableDay(
  days: SpaceAvailabilityDay[] | null | undefined,
  open: OpenInterval,
  granularityMinutes: number,
  fromIso: string,
): SpaceAvailabilityDay | null {
  if (!Array.isArray(days)) return null;
  for (const day of days) {
    if (day.date < fromIso) continue;
    if (isDayBookable(day, open, granularityMinutes)) return day;
  }
  return null;
}

export function findFirstSlotOnOrAfter(
  intervals: OpenInterval[],
  granularityMinutes: number,
  fromTime: string,
): { start: string; end: string } | null {
  const fromMinutes = timeToMinutes(fromTime);
  for (const interval of intervals) {
    const start = timeToMinutes(interval.start);
    const end = timeToMinutes(interval.end);
    const candidateStart = Math.max(start, fromMinutes);
    const aligned =
      candidateStart % granularityMinutes === 0
        ? candidateStart
        : candidateStart + (granularityMinutes - (candidateStart % granularityMinutes));
    if (aligned + granularityMinutes <= end) {
      return {
        start: minutesToTime(aligned),
        end: minutesToTime(aligned + granularityMinutes),
      };
    }
  }
  return null;
}

export function nowTimeInZone(timeZone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    });
    return fmt.format(new Date());
  } catch {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }
}

export function todayIsoInZone(timeZone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });
    return fmt.format(new Date());
  } catch {
    return todayIso();
  }
}

function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const value = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = value.match(/^GMT(?:(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?)?$/);
  if (!match?.groups?.sign) return 0;
  const hours = Number(match.groups.hours || 0);
  const minutes = Number(match.groups.minutes || 0);
  const sign = match.groups.sign === "-" ? -1 : 1;
  return sign * (hours * 60 + minutes);
}

export function zonedDateTimeToUtc(dateIso: string, timeValue: string, timeZone: string): Date {
  const [year, month, day] = dateIso.split("-").map((part) => Number(part));
  const [hour, minute] = timeValue.split(":").map((part) => Number(part));
  if (![year, month, day, hour, minute].every((value) => Number.isFinite(value))) {
    return new Date(Number.NaN);
  }

  const localWallMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let utcMs = localWallMs;
  for (let i = 0; i < 2; i += 1) {
    utcMs = localWallMs - timeZoneOffsetMinutes(new Date(utcMs), timeZone) * 60_000;
  }
  return new Date(utcMs);
}
