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
}

export interface CalendarSpace {
  public_id: string;
  name: string | null;
  space_type: string;
  location_public_id: string;
  location_name: string;
  location_timezone: string | null;
}

export interface CalendarResponse {
  start: string;
  end: string;
  events: CalendarEvent[];
  spaces: CalendarSpace[];
  truncated: boolean;
}

export const SPACE_TYPE_LABEL: Record<string, string> = {
  private_office: "Private office",
  shared_desk: "Shared desk",
  conference_room: "Meeting room",
  virtual_office: "Virtual office",
  suite: "Suite",
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
