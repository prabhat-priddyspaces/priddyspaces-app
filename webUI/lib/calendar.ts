export type CalendarEventKind = "booking" | "request" | "subscription";

export interface CalendarMember {
  public_id: string;
  name: string;
  email: string;
}

export interface CalendarEvent {
  kind: CalendarEventKind;
  public_id: string;
  space_public_id: string;
  space_name: string | null;
  space_type: string;
  location_public_id: string;
  location_name: string;
  start: string;
  end: string;
  status: string;
  payment_status: string | null;
  member: CalendarMember;
  amount_cents: number | null;
  checked_in: boolean | null;
  no_show: boolean | null;
  request_kind: string | null;
  plan_name: string | null;
  seats_requested?: number | null;
}

export interface CalendarSpace {
  public_id: string;
  name: string | null;
  space_type: string;
  location_public_id: string;
  location_name: string;
  location_timezone: string | null;
  capacity?: number | null;
}

export interface CalendarResponse {
  start: string;
  end: string;
  events: CalendarEvent[];
  spaces: CalendarSpace[];
  truncated: boolean;
}

// Static labels for the built-in space types. Used for first paint / fallback;
// the live source of truth is the space-types registry (see lib/space-types.ts).
export const SPACE_TYPE_LABEL: Record<string, string> = {
  private_office: "Private office",
  shared_desk: "Shared desk",
  conference_room: "Meeting room",
  virtual_office: "Virtual office",
  suite: "Suite",
  event_space: "Event space",
  business_address: "Business address",
};

export const SPACE_TYPES = Object.keys(SPACE_TYPE_LABEL);

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "booking.pending", label: "Booking pending" },
  { value: "booking.confirmed", label: "Booking confirmed" },
  { value: "booking.canceled", label: "Booking canceled" },
  { value: "request.requested", label: "Request pending" },
  { value: "request.payment_failed", label: "Payment failed" },
  { value: "subscription.active", label: "Subscription active" },
];

const STATUS_COLOR: Record<string, string> = {
  "booking.pending": "bg-warning/15 text-warning border-warning/40",
  "booking.confirmed": "bg-success/15 text-success border-success/40",
  "booking.canceled": "bg-textMuted/10 text-textMuted border-textMuted/30 line-through",
  "request.requested": "bg-info/15 text-info border-info/40",
  "request.payment_failed": "bg-error/15 text-error border-error/40",
  "subscription.active": "bg-accentSubtle text-accent border-accent/30",
};

export function statusColorClass(status: string): string {
  return STATUS_COLOR[status] || "bg-surface2 text-textPrimary border-border";
}

const STATUS_EVENT_COLOR: Record<string, string> = {
  "booking.pending": "border-amber-300 border-l-4 border-l-amber-500 bg-amber-50 text-amber-950 shadow-sm",
  "booking.confirmed": "border-emerald-300 border-l-4 border-l-emerald-600 bg-emerald-50 text-emerald-950 shadow-sm",
  "booking.canceled": "border-slate-300 border-l-4 border-l-slate-400 bg-slate-100 text-slate-600 shadow-sm line-through",
  "request.requested": "border-blue-300 border-l-4 border-l-blue-600 bg-blue-50 text-blue-950 shadow-sm",
  "request.payment_failed": "border-red-300 border-l-4 border-l-red-600 bg-red-50 text-red-950 shadow-sm",
  "subscription.active": "border-indigo-300 border-l-4 border-l-indigo-600 bg-indigo-50 text-indigo-950 shadow-sm",
};

export function statusEventClass(status: string): string {
  return STATUS_EVENT_COLOR[status] || "border-slate-300 border-l-4 border-l-slate-500 bg-white text-slate-900 shadow-sm";
}

export type CalendarSlotTone = "booked" | "pending" | "mixed" | "payment_issue" | "membership" | "muted";

export interface CalendarSlotCounts {
  booked: number;
  pending: number;
  paymentFailed: number;
  memberships: number;
  other: number;
}

export interface CalendarSlotGroup {
  id: string;
  space_public_id: string;
  space_name: string | null;
  space_type: string;
  location_public_id: string;
  location_name: string;
  start: string;
  end: string;
  capacity: number | null;
  events: CalendarEvent[];
  counts: CalendarSlotCounts;
  label: string;
  detailLabel: string;
  tone: CalendarSlotTone;
}

const SLOT_EVENT_COLOR: Record<CalendarSlotTone, string> = {
  booked: "border-emerald-300 border-l-4 border-l-emerald-600 bg-emerald-50 text-emerald-950 shadow-sm",
  pending: "border-blue-300 border-l-4 border-l-blue-600 bg-blue-50 text-blue-950 shadow-sm",
  mixed: "border-amber-300 border-l-4 border-l-amber-600 bg-amber-50 text-amber-950 shadow-sm",
  payment_issue: "border-red-300 border-l-4 border-l-red-600 bg-red-50 text-red-950 shadow-sm",
  membership: "border-indigo-300 border-l-4 border-l-indigo-600 bg-indigo-50 text-indigo-950 shadow-sm",
  muted: "border-slate-300 border-l-4 border-l-slate-500 bg-white text-slate-900 shadow-sm",
};

export function slotEventClass(tone: CalendarSlotTone): string {
  return SLOT_EVENT_COLOR[tone];
}

function eventSeatCount(event: CalendarEvent): number {
  return Math.max(1, event.seats_requested ?? 1);
}

function countFor(event: CalendarEvent, space: CalendarSpace | undefined): number {
  return space?.space_type === "shared_desk" ? eventSeatCount(event) : 1;
}

function slotCounts(events: CalendarEvent[], space: CalendarSpace | undefined): CalendarSlotCounts {
  return events.reduce<CalendarSlotCounts>(
    (counts, event) => {
      const count = countFor(event, space);
      if (event.status === "request.payment_failed") {
        counts.paymentFailed += count;
      } else if (event.kind === "booking" && event.status === "booking.confirmed") {
        counts.booked += count;
      } else if (event.status === "request.requested" || event.status === "booking.pending") {
        counts.pending += count;
      } else if (event.kind === "subscription" && event.status === "subscription.active") {
        counts.memberships += count;
      } else {
        counts.other += count;
      }
      return counts;
    },
    { booked: 0, pending: 0, paymentFailed: 0, memberships: 0, other: 0 }
  );
}

function slotTone(counts: CalendarSlotCounts): CalendarSlotTone {
  if (counts.paymentFailed > 0) return "payment_issue";
  if (counts.booked > 0 && counts.pending > 0) return "mixed";
  if (counts.booked > 0) return "booked";
  if (counts.pending > 0) return "pending";
  if (counts.memberships > 0) return "membership";
  return "muted";
}

function slotLabel(counts: CalendarSlotCounts): string {
  const parts: string[] = [];
  if (counts.paymentFailed > 0) {
    parts.push(counts.paymentFailed === 1 ? "Payment issue" : `${counts.paymentFailed} payment issues`);
  }
  if (counts.booked > 0) parts.push(`${counts.booked} booked`);
  if (counts.pending > 0) parts.push(`${counts.pending} pending`);
  if (counts.memberships > 0) {
    parts.push(counts.memberships === 1 ? "1 membership" : `${counts.memberships} memberships`);
  }
  if (parts.length === 0 && counts.other > 0) {
    parts.push(counts.other === 1 ? "1 event" : `${counts.other} events`);
  }
  return parts.join(" • ") || "No events";
}

function slotDetailLabel(group: Pick<CalendarSlotGroup, "capacity" | "counts" | "space_type">): string {
  if (group.space_type !== "shared_desk" || group.capacity == null) return "";
  const occupied = group.counts.booked + group.counts.pending + group.counts.paymentFailed;
  return `${occupied}/${group.capacity} seats`;
}

export function groupCalendarSlotEvents(
  events: CalendarEvent[],
  spaces: CalendarSpace[] = []
): CalendarSlotGroup[] {
  const spacesById = new Map(spaces.map((space) => [space.public_id, space]));
  const grouped = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = `${event.space_public_id}|${event.start}|${event.end}`;
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }

  return Array.from(grouped.values())
    .map((groupEvents) => {
      const first = groupEvents[0];
      const space = spacesById.get(first.space_public_id);
      const counts = slotCounts(groupEvents, space);
      const base = {
        id: `slot-${first.space_public_id}-${new Date(first.start).getTime()}-${new Date(first.end).getTime()}`,
        space_public_id: first.space_public_id,
        space_name: first.space_name,
        space_type: space?.space_type ?? first.space_type,
        location_public_id: first.location_public_id,
        location_name: first.location_name,
        start: first.start,
        end: first.end,
        capacity: space?.capacity ?? null,
        events: groupEvents,
        counts,
        label: slotLabel(counts),
        tone: slotTone(counts),
      };
      return {
        ...base,
        detailLabel: slotDetailLabel(base),
      };
    })
    .sort((a, b) => {
      const startDiff = new Date(a.start).getTime() - new Date(b.start).getTime();
      if (startDiff !== 0) return startDiff;
      return a.id.localeCompare(b.id);
    });
}

export function eventDuration(event: CalendarEvent): number {
  return new Date(event.end).getTime() - new Date(event.start).getTime();
}

export function formatTime(iso: string, timezone: string | null | undefined): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone || undefined,
  }).format(date);
}

export function formatDate(iso: string, timezone: string | null | undefined): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: timezone || undefined,
  }).format(date);
}

export function formatDateTime(iso: string, timezone: string | null | undefined): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone || undefined,
  }).format(date);
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  return addDays(d, -day);
}

export function startOfMonth(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

export function endOfMonth(date: Date): Date {
  const d = startOfMonth(date);
  d.setMonth(d.getMonth() + 1);
  return d;
}

export function isoDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatCurrency(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
