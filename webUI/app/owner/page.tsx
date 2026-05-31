"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  Calendar,
  Check,
  DollarSign,
  MessageCircle,
  Plus,
  Sparkles,
  Users,
  X,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/charts/stat-card";
import { RevenueChart, type RevenueDay } from "@/components/charts/revenue-chart";
import {
  TimelineMini,
  type TimelineRoom,
} from "@/components/dashboard/timeline-mini";
import { OwnerDashboardEmpty } from "@/components/dashboard/owner-dashboard-empty";
import { useMe } from "@/hooks/useMe";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { moneyToNumber, type MoneyValue } from "@/lib/money";
import {
  type CalendarEvent,
  type CalendarResponse,
  SPACE_TYPE_LABEL,
} from "@/lib/calendar";

interface BookingRequest {
  status: string;
  estimated_amount: MoneyValue | null;
  created_at?: string;
  starts_at?: string;
  ends_at?: string;
  notes?: string | null;
  member?: { first_name?: string | null; last_name?: string | null; email?: string | null } | null;
  space?: { name?: string | null } | null;
  location?: { name?: string | null } | null;
}

interface Payment {
  amount: number;
  status: string;
  created_at: string;
  amount_cents?: number | null;
  refunded_amount_cents?: number | null;
  booking_id?: number | null;
  subscription_id?: number | null;
}

interface Invoice {
  amount: number;
  created_at: string;
}

interface Organization {
  public_id: string;
  name: string;
}

interface Location {
  public_id: string;
  name: string;
  city: string | null;
}

interface Space {
  public_id: string;
  availability_status: string;
}

interface Subscription {
  status: string;
}

interface LocationSummary {
  public_id: string;
  name: string;
  city: string | null;
  totalSpaces: number;
  occupiedSpaces: number;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const DASHBOARD_TIMELINE_START_HOUR = 8;
const DASHBOARD_TIMELINE_END_HOUR = 18;
const DASHBOARD_TIMELINE_ROWS = 6;

function startOfLocalDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addLocalDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, "0"),
    `${date.getDate()}`.padStart(2, "0"),
  ].join("-");
}

function paymentAmount(payment: Payment): number {
  if (typeof payment.amount_cents === "number") return payment.amount_cents / 100;
  return payment.amount || 0;
}

function paymentRefundedAmount(payment: Payment): number {
  return typeof payment.refunded_amount_cents === "number"
    ? payment.refunded_amount_cents / 100
    : payment.status === "refunded"
    ? paymentAmount(payment)
    : 0;
}

function buildRevenueSeries(payments: Payment[]): RevenueDay[] {
  const today = startOfLocalDay(new Date());
  const firstDay = addLocalDays(today, -29);
  const series = Array.from({ length: 30 }, (_, index) => ({
    key: localDateKey(addLocalDays(firstDay, index)),
    bookings: 0,
    members: 0,
  }));
  const byKey = new Map(series.map((day) => [day.key, day]));

  for (const payment of payments) {
    if (payment.status !== "succeeded" || !payment.created_at) continue;
    const createdAt = new Date(payment.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;
    const day = byKey.get(localDateKey(createdAt));
    if (!day) continue;
    const netAmount = Math.max(0, paymentAmount(payment) - paymentRefundedAmount(payment));
    if (payment.subscription_id != null) day.members += netAmount;
    else day.bookings += netAmount;
  }

  return series.map(({ bookings, members }) => ({ bookings, members }));
}

function dashboardTimelineWindow(date: Date): { start: number; end: number } {
  const start = startOfLocalDay(date);
  start.setHours(DASHBOARD_TIMELINE_START_HOUR, 0, 0, 0);
  const end = startOfLocalDay(date);
  end.setHours(DASHBOARD_TIMELINE_END_HOUR, 0, 0, 0);
  return { start: start.getTime(), end: end.getTime() };
}

function timelineNowPosition(): number | undefined {
  const { start, end } = dashboardTimelineWindow(new Date());
  const now = Date.now();
  if (now < start || now > end) return undefined;
  return (now - start) / (end - start);
}

function timelineEventTone(event: CalendarEvent): "violet" | "mint" | "pending" | "warning" | "muted" {
  if (event.kind === "subscription") return "mint";
  if (event.kind === "request") {
    return event.status.includes("payment_failed") ? "warning" : "pending";
  }
  if (event.status.includes("canceled")) return "muted";
  return "violet";
}

function timelineEventLabel(event: CalendarEvent): string {
  const memberName =
    event.member?.name && event.member.name !== "Unknown" ? event.member.name : null;
  if (event.kind === "subscription") {
    return event.plan_name || (memberName ? `${memberName} membership` : "Membership");
  }
  if (event.kind === "request") {
    return memberName ? `${memberName} request` : "Request";
  }
  return memberName || event.space_name || "Booking";
}

function buildTimelineRooms(calendar: CalendarResponse | null): TimelineRoom[] {
  if (!calendar) return [];
  const { start, end } = dashboardTimelineWindow(new Date());
  const span = end - start;
  const eventsBySpace = new Map<string, CalendarEvent[]>();
  for (const event of calendar.events ?? []) {
    const eventStart = new Date(event.start).getTime();
    const eventEnd = new Date(event.end).getTime();
    if (Number.isNaN(eventStart) || Number.isNaN(eventEnd)) continue;
    if (eventEnd <= start || eventStart >= end) continue;
    const list = eventsBySpace.get(event.space_public_id) ?? [];
    list.push(event);
    eventsBySpace.set(event.space_public_id, list);
  }

  return (calendar.spaces ?? []).slice(0, DASHBOARD_TIMELINE_ROWS).map((space) => ({
    name: space.name || "Untitled space",
    type: SPACE_TYPE_LABEL[space.space_type] || space.space_type,
    events: (eventsBySpace.get(space.public_id) ?? [])
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .map((event) => {
        const eventStart = new Date(event.start).getTime();
        const eventEnd = new Date(event.end).getTime();
        const clampedStart = Math.max(eventStart, start);
        const clampedEnd = Math.min(eventEnd, end);
        return {
          start: (clampedStart - start) / span,
          width: Math.max((clampedEnd - clampedStart) / span, 0.04),
          label: timelineEventLabel(event),
          tone: timelineEventTone(event),
        };
      }),
  }));
}

function openDashboardAssistant() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("priddyspaces:assistant-open", {
      detail: {
        prefill: "What should I prioritize on my owner dashboard today?",
      },
    })
  );
}

function requesterName(req: BookingRequest): string {
  const name = [req.member?.first_name, req.member?.last_name]
    .filter(Boolean)
    .join(" ");
  return name || req.member?.email || "Member";
}

function requestWhere(req: BookingRequest): string {
  const space = req.space?.name ?? "Space";
  const location = req.location?.name;
  return location ? `${space} · ${location}` : space;
}

function requestWhen(req: BookingRequest): string {
  if (!req.starts_at) return "";
  try {
    const start = new Date(req.starts_at);
    return start.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function OwnerDashboard() {
  const { me } = useMe();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [membersCount, setMembersCount] = useState(0);
  const [locationSummaries, setLocationSummaries] = useState<LocationSummary[]>([]);
  const [todayCalendar, setTodayCalendar] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      const token = getAccessToken() ?? undefined;
      setLoading(true);
      setError("");

      try {
        const todayStart = startOfLocalDay(new Date());
        const todayEnd = addLocalDays(todayStart, 1);
        const calendarParams = new URLSearchParams();
        calendarParams.set("start", todayStart.toISOString());
        calendarParams.set("end", todayEnd.toISOString());
        calendarParams.set("include", "bookings,requests,subscriptions");
        const [requestsResp, paymentsResp, invoicesResp, orgsResp, subscriptionsResp, calendarResp] = await Promise.all([
          apiFetch<BookingRequest[]>("/api/booking-requests", { method: "GET" }, token).catch(() => []),
          apiFetch<Payment[]>("/api/payments", { method: "GET" }, token).catch(() => []),
          apiFetch<Invoice[]>("/api/invoices", { method: "GET" }, token).catch(() => []),
          apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token).catch(() => []),
          apiFetch<Subscription[]>("/api/subscriptions", { method: "GET" }, token).catch(() => []),
          apiFetch<CalendarResponse>(
            `/api/owner/calendar?${calendarParams.toString()}`,
            { method: "GET" },
            token
          ).catch(() => null),
        ]);

        if (!active) return;

        setRequests(requestsResp);
        setPayments(paymentsResp);
        setInvoices(invoicesResp);
        setSubscriptions(subscriptionsResp);
        setTodayCalendar(calendarResp);

        if (orgsResp.length === 0) {
          setMembersCount(0);
          setLocationSummaries([]);
          setTodayCalendar(null);
          return;
        }

        const orgId = orgsResp[0].public_id;
        const [membersResp, locationsResp] = await Promise.all([
          apiFetch<unknown[]>(`/api/orgs/${orgId}/members`, { method: "GET" }, token).catch(() => []),
          apiFetch<Location[]>(
            `/api/locations?organization_public_id=${orgId}`,
            { method: "GET" },
            token
          ).catch(() => []),
        ]);

        if (!active) return;

        setMembersCount(membersResp.length);

        const spacesByLocation = await Promise.all(
          locationsResp.map((location) =>
            apiFetch<Space[]>(`/api/locations/${location.public_id}/spaces`, { method: "GET" }, token).catch(
              () => []
            )
          )
        );

        if (!active) return;

        setLocationSummaries(
          locationsResp.map((location, index) => {
            const spaces = spacesByLocation[index] ?? [];
            return {
              public_id: location.public_id,
              name: location.name,
              city: location.city,
              totalSpaces: spaces.length,
              occupiedSpaces: spaces.filter((space) => space.availability_status !== "available").length,
            };
          })
        );
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const pendingRequests = requests.filter((r) => r.status === "requested").length;
    const approvedRequests = requests.filter((r) => r.status === "approved").length;
    const monthRevenue = payments
      .filter((payment) => {
        const createdAt = new Date(payment.created_at);
        return (
          payment.status === "succeeded" &&
          createdAt.getMonth() === currentMonth &&
          createdAt.getFullYear() === currentYear
        );
      })
      .reduce((sum, payment) => sum + paymentAmount(payment) - paymentRefundedAmount(payment), 0);
    const activeMemberships = subscriptions.filter((s) =>
      ["active", "trialing", "past_due", "canceling"].includes(s.status)
    ).length;
    const totalSpaces = locationSummaries.reduce((sum, l) => sum + l.totalSpaces, 0);
    const occupiedSpaces = locationSummaries.reduce((sum, l) => sum + l.occupiedSpaces, 0);
    const occupancy = totalSpaces === 0 ? null : Math.round((occupiedSpaces / totalSpaces) * 100);
    const grossRevenue = payments
      .filter((p) => p.status === "succeeded")
      .reduce((sum, p) => sum + paymentAmount(p), 0);
    const refundedRevenue = payments.reduce((sum, p) => sum + paymentRefundedAmount(p), 0);
    const openRequestValue = requests
      .filter((r) => r.status === "requested")
      .reduce((sum, r) => sum + (moneyToNumber(r.estimated_amount) ?? 0), 0);
    const todayBookings =
      todayCalendar?.events?.filter((event) => event.kind === "booking").length ??
      requests.filter((r) => {
        if (!r.starts_at) return false;
        const start = new Date(r.starts_at);
        return (
          start.getDate() === now.getDate() &&
          start.getMonth() === now.getMonth() &&
          start.getFullYear() === now.getFullYear()
        );
      }).length;

    return {
      pendingRequests,
      approvedRequests,
      monthRevenue,
      activeMemberships,
      totalSpaces,
      occupiedSpaces,
      occupancy,
      grossRevenue,
      refundedRevenue,
      openRequestValue,
      todayBookings,
      invoiceVolume: invoices.reduce((sum, i) => sum + (i.amount || 0), 0),
    };
  }, [invoices, locationSummaries, payments, requests, subscriptions, todayCalendar]);

  const revenueSeries = useMemo(() => buildRevenueSeries(payments), [payments]);
  const hasRevenueSeries = revenueSeries.some((day) => day.bookings > 0 || day.members > 0);
  const timelineRooms = useMemo(() => buildTimelineRooms(todayCalendar), [todayCalendar]);
  const currentTimelinePosition = timelineNowPosition();

  const pendingPreview = useMemo(
    () =>
      requests
        .filter((r) => r.status === "requested")
        .slice(0, 4),
    [requests]
  );

  const isEmpty = !loading && locationSummaries.length === 0;
  const firstName = me?.first_name ?? null;

  return (
    <AppShell
      title="Dashboard"
      breadcrumb={["Owner", me?.company_name ?? "Workspace"]}
    >
      {error ? (
        <div className="mb-4 text-[13px] text-danger">{error}</div>
      ) : null}

      {loading ? (
        <div className="text-[13px] text-text-3">Loading…</div>
      ) : isEmpty ? (
        <OwnerDashboardEmpty firstName={firstName ?? undefined} />
      ) : (
        <div className="space-y-5">
          {/* Hero strip */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[22px] font-semibold tracking-[-0.02em]">
                {greeting()}{firstName ? `, ${firstName}` : ""}.
              </h2>
              <p className="text-[13px] text-text-3 mt-1">
                {stats.pendingRequests} {stats.pendingRequests === 1 ? "request" : "requests"} waiting · {stats.todayBookings} bookings today
                {stats.occupancy != null ? ` · occupancy ${stats.occupancy}%` : ""}.
              </p>
            </div>
            <div className="hidden lg:flex items-center gap-2">
              <Button
                type="button"
                variant="default"
                size="default"
                onClick={openDashboardAssistant}
                aria-label="Open assistant for dashboard suggestions"
              >
                <Sparkles size={14} strokeWidth={2.5} />
                Ask AI
                <MessageCircle size={14} />
              </Button>
              <Link href="/owner/calendar">
                <Button variant="default" size="default">
                  <Calendar size={14} />
                  Calendar
                </Button>
              </Link>
              <Link href="/owner/spaces/new">
                <Button variant="primary" size="default">
                  <Plus size={14} />
                  New space
                </Button>
              </Link>
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <StatCard
              label="MTD Revenue"
              value={currencyFormatter.format(stats.monthRevenue)}
              icon={DollarSign}
              accent="violet"
              sub={`Open ${currencyFormatter.format(stats.openRequestValue)} in pending requests`}
            />
            <StatCard
              label="Bookings"
              value={stats.approvedRequests.toString()}
              icon={Calendar}
              accent="violet"
              sub={`${stats.todayBookings} starting today`}
            />
            <StatCard
              label="Occupancy"
              value={stats.occupancy != null ? `${stats.occupancy}%` : "—"}
              icon={Building2}
              accent="mint"
              sub={`${stats.occupiedSpaces} of ${stats.totalSpaces} spaces in use`}
            />
            <StatCard
              label="Active members"
              value={stats.activeMemberships.toString()}
              icon={Users}
              sub={`${membersCount} total invited`}
            />
          </div>

          {/* Main grid */}
          <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
            {/* Today timeline */}
            <Card padded={false} className="p-5">
              <SectionHead
                title={`Today · ${locationSummaries.length} ${
                  locationSummaries.length === 1 ? "location" : "locations"
                } · ${stats.totalSpaces} rooms`}
                sub={new Date().toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
                right={
                  <Link href="/owner/calendar">
                    <Button variant="ghost" size="sm">
                      Open calendar
                      <ArrowRight size={12} />
                    </Button>
                  </Link>
                }
              />
              {timelineRooms.length === 0 ? (
                <div className="flex min-h-[140px] items-center justify-center rounded-lg bg-surface-2 text-[13px] text-text-3">
                  No spaces or calendar items found for today.
                </div>
              ) : (
                <TimelineMini rooms={timelineRooms} now={currentTimelinePosition} />
              )}
            </Card>

            {/* Requests inbox */}
            <Card padded={false} className="p-5">
              <SectionHead
                title="Pending requests"
                sub={`${stats.pendingRequests} waiting`}
                right={
                  <Link href="/owner/requests">
                    <Button variant="ghost" size="sm">
                      Open inbox
                      <ArrowRight size={12} />
                    </Button>
                  </Link>
                }
              />
              <div className="flex flex-col">
                {pendingPreview.length === 0 ? (
                  <div className="text-[13px] text-text-3 py-3">
                    No pending requests — you&apos;re all caught up.
                  </div>
                ) : (
                  pendingPreview.map((req, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-2.5 py-2.5",
                        i > 0 && "border-t border-line"
                      )}
                    >
                      <Avatar name={requesterName(req)} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-semibold">
                            {requesterName(req)}
                          </span>
                          <span
                            aria-hidden
                            className="w-1.5 h-1.5 rounded-full bg-brand"
                          />
                        </div>
                        <div
                          className="text-[11px] text-text-3 truncate"
                          title={`${requestWhere(req)} · ${requestWhen(req)}`}
                        >
                          {requestWhere(req)}
                          {requestWhen(req) ? ` · ${requestWhen(req)}` : ""}
                        </div>
                      </div>
                      <div
                        className="font-mono text-[13px] font-semibold"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {currencyFormatter.format(
                          moneyToNumber(req.estimated_amount) ?? 0
                        )}
                      </div>
                      <Link href="/owner/requests" aria-label="Approve">
                        <Button
                          variant="default"
                          size="sm"
                          className="h-[26px] w-[26px] p-0 justify-center border-success/30 text-success"
                        >
                          <Check size={13} strokeWidth={2.5} />
                        </Button>
                      </Link>
                      <Link href="/owner/requests" aria-label="Reject">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-[26px] w-[26px] p-0 justify-center"
                        >
                          <X size={13} strokeWidth={2.5} />
                        </Button>
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Revenue chart */}
            <Card padded={false} className="p-5">
              <SectionHead
                title="Revenue · last 30 days"
                sub="Net of refunds & platform fees"
                right={
                  <>
                    <LegendDot color="var(--brand)" label="Bookings" />
                    <LegendDot color="var(--ps-mint-500)" label="Memberships" />
                  </>
                }
              />
              {hasRevenueSeries ? (
                <RevenueChart data={revenueSeries} />
              ) : (
                <div className="flex h-[140px] items-center justify-center rounded-lg bg-surface-2 text-[13px] text-text-3">
                  No revenue recorded in the last 30 days.
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-3.5 mt-3 border-t border-line">
                <MiniStat
                  label="Gross"
                  value={currencyFormatter.format(stats.grossRevenue)}
                />
                <MiniStat
                  label="Refunded"
                  value={currencyFormatter.format(stats.refundedRevenue)}
                />
                <MiniStat
                  label="Invoices"
                  value={currencyFormatter.format(stats.invoiceVolume)}
                />
                <MiniStat
                  label="Net (MTD)"
                  value={currencyFormatter.format(stats.monthRevenue)}
                  highlight
                />
              </div>
            </Card>

            {/* Locations */}
            <Card padded={false} className="p-5">
              <SectionHead
                title="Locations"
                sub={`${locationSummaries.length} active`}
                right={
                  <Link href="/owner/locations">
                    <Button variant="ghost" size="sm">
                      Manage locations
                      <ArrowRight size={12} />
                    </Button>
                  </Link>
                }
              />
              <div className="flex flex-col">
                {locationSummaries.map((location, i) => {
                  const rate =
                    location.totalSpaces === 0
                      ? 0
                      : location.occupiedSpaces / location.totalSpaces;
                  const barColor =
                    rate > 0.8
                      ? "var(--ps-success)"
                      : rate > 0.5
                      ? "var(--brand)"
                      : "var(--text-4)";
                  return (
                    <div
                      key={location.public_id}
                      className={cn(
                        "grid grid-cols-[1fr_80px_60px] items-center gap-3 py-2",
                        i > 0 && "border-t border-line"
                      )}
                    >
                      <div>
                        <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                          {location.name}
                        </div>
                        <div className="text-[11px] text-text-3 mt-px">
                          {location.city ?? "City not set"} · {location.totalSpaces}{" "}
                          {location.totalSpaces === 1 ? "room" : "rooms"}
                        </div>
                      </div>
                      <div>
                        <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${rate * 100}%`, background: barColor }}
                          />
                        </div>
                        <div
                          className="font-mono text-[10px] text-text-3 mt-0.5"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {Math.round(rate * 100)}% occ
                        </div>
                      </div>
                      <div
                        className="font-mono text-[12px] text-text-2 text-right"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {location.occupiedSpaces} active
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function SectionHead({
  title,
  sub,
  right,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between mb-3.5 gap-3">
      <div>
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
        {sub && <div className="text-[12px] text-text-3 mt-0.5">{sub}</div>}
      </div>
      {right && (
        <div className="flex gap-1.5 items-center">{right}</div>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-text-3">
      <span
        aria-hidden
        className="w-2 h-2 rounded-sm"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function MiniStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.05em] text-text-3 font-medium">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-[16px] font-semibold mt-0.5 tracking-[-0.02em]",
          highlight ? "text-brand" : "text-text"
        )}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
    </div>
  );
}
