export type SpaceAvailabilityInterval = {
  start: string;
  end: string;
};

export type SpaceAvailabilityDay = {
  date: string;
  fully_blocked: boolean;
  busy_intervals: SpaceAvailabilityInterval[];
};

export type SpaceAvailabilityResponse = {
  space_public_id: string;
  timezone: string;
  granularity_minutes: number | null;
  availability_start_time: string | null;
  availability_end_time: string | null;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  hourly_price: string | number | null;
  daily_price: string | number | null;
  show_calendar_daily_prices?: boolean;
  days: SpaceAvailabilityDay[];
};

export type OpenInterval = {
  start: string;
  end: string;
};

export const DEFAULT_OPEN_TIME = "09:00";
export const DEFAULT_CLOSE_TIME = "18:00";
export const DEFAULT_GRANULARITY_MINUTES = 30;

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map((part) => Number(part));
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

export function minutesToTime(value: number) {
  const clamped = Math.max(0, Math.min(24 * 60, value));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  if (hours === 24) return "24:00";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function getDayOpenWindow(
  availability: Pick<SpaceAvailabilityResponse, "availability_start_time" | "availability_end_time">,
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
    .map((interval) => ({
      start: Math.max(openStart, timeToMinutes(interval.start)),
      end: Math.min(openEnd, timeToMinutes(interval.end)),
    }))
    .filter((interval) => interval.end > interval.start)
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

  const openIntervals: OpenInterval[] = [];
  let cursor = openStart;
  for (const interval of merged) {
    if (interval.start > cursor) {
      openIntervals.push({ start: minutesToTime(cursor), end: minutesToTime(interval.start) });
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < openEnd) {
    openIntervals.push({ start: minutesToTime(cursor), end: minutesToTime(openEnd) });
  }
  return openIntervals;
}

export function isDayBookable(
  day: SpaceAvailabilityDay | undefined,
  open: OpenInterval,
  granularityMinutes: number,
) {
  return getOpenIntervalsForDay(day, open).some(
    (interval) => timeToMinutes(interval.end) - timeToMinutes(interval.start) >= granularityMinutes,
  );
}

export function buildSlotOptions(
  intervals: OpenInterval[],
  granularityMinutes: number,
  alignFromTime?: string,
) {
  const slots: string[] = [];
  const alignmentBase = timeToMinutes(alignFromTime ?? intervals[0]?.start ?? DEFAULT_OPEN_TIME);
  for (const interval of intervals) {
    const start = timeToMinutes(interval.start);
    const end = timeToMinutes(interval.end);
    const remainder = ((start - alignmentBase) % granularityMinutes + granularityMinutes) % granularityMinutes;
    const alignedStart = remainder === 0 ? start : start + (granularityMinutes - remainder);
    for (let mins = alignedStart; mins + granularityMinutes <= end; mins += granularityMinutes) {
      slots.push(minutesToTime(mins));
    }
  }
  return slots;
}

export function buildEndSlotOptions(
  intervals: OpenInterval[],
  startTime: string,
  granularityMinutes: number,
) {
  const startMinutes = timeToMinutes(startTime);
  const containing = intervals.find(
    (interval) => timeToMinutes(interval.start) <= startMinutes && startMinutes < timeToMinutes(interval.end),
  );
  if (!containing) return [];
  const end = timeToMinutes(containing.end);
  const options: string[] = [];
  for (let mins = startMinutes + granularityMinutes; mins <= end; mins += granularityMinutes) {
    options.push(minutesToTime(mins));
  }
  return options;
}

export function findFirstSlotOnOrAfter(
  intervals: OpenInterval[],
  granularityMinutes: number,
  fromTime: string,
  alignFromTime?: string,
) {
  const fromMinutes = timeToMinutes(fromTime);
  const alignmentBase = timeToMinutes(alignFromTime ?? intervals[0]?.start ?? DEFAULT_OPEN_TIME);
  for (const interval of intervals) {
    const start = timeToMinutes(interval.start);
    const end = timeToMinutes(interval.end);
    const candidateStart = Math.max(start, fromMinutes);
    const remainder = ((candidateStart - alignmentBase) % granularityMinutes + granularityMinutes) % granularityMinutes;
    const aligned = remainder === 0 ? candidateStart : candidateStart + (granularityMinutes - remainder);
    if (aligned + granularityMinutes <= end) {
      return {
        start: minutesToTime(aligned),
        end: minutesToTime(aligned + granularityMinutes),
      };
    }
  }
  return null;
}
