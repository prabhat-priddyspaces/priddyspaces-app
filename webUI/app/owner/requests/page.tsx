"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  SlidersHorizontal,
  X,
} from "lucide-react";

const FAILURE_FALLBACK =
  "Approval was saved as payment failed because the saved card could not be charged.";

function formatDeadline(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useApiToken } from "@/hooks/useApiToken";
import { apiFetch } from "@/lib/api";
import { formatUsd, type MoneyValue } from "@/lib/money";

interface BookingRequest {
  public_id: string;
  space_public_id: string | null;
  space_name: string | null;
  space_type: string | null;
  location_public_id: string | null;
  location_name: string | null;
  location_city: string | null;
  member_public_id: string | null;
  member_name: string | null;
  member_email: string | null;
  member_phone: string | null;
  member_company_name: string | null;
  booking_id: number | null;
  booking_public_id: string | null;
  start_datetime: string;
  end_datetime: string;
  status: string;
  payment_status: string | null;
  payment_provider: string | null;
  cancellation_deadline_at: string | null;
  estimated_amount: MoneyValue | null;
  operator_notes: string | null;
  failure_reason: string | null;
  is_guest_checkout: boolean;
  guest_email: string | null;
  guest_full_name: string | null;
  guest_phone: string | null;
  guest_company_name: string | null;
  guest_notes: string | null;
  membership_plan_name: string | null;
  price_daily: MoneyValue | null;
  price_monthly: MoneyValue | null;
  price_hourly: MoneyValue | null;
  base_amount_cents: number | null;
  rate_basis: string | null;
  units: number | null;
  request_kind: string;
}

type StatusFilter =
  | "all"
  | "requested"
  | "approved"
  | "payment_failed"
  | "rejected"
  | "cancelled";

type DecisionAction = "approve" | "reject";

const FILTER_OPTIONS: { value: StatusFilter; label: string; tone?: "danger" }[] = [
  { value: "all", label: "All" },
  { value: "requested", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "payment_failed", label: "Payment failed", tone: "danger" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

function statusToBadge(status: string): {
  variant: "success" | "warning" | "danger" | "info" | "default";
  label: string;
} {
  switch (status) {
    case "approved":
      return { variant: "success", label: "Confirmed" };
    case "requested":
      return { variant: "warning", label: "Pending" };
    case "payment_failed":
      return { variant: "danger", label: "Payment failed" };
    case "rejected":
    case "cancelled":
      return { variant: "danger", label: status === "cancelled" ? "Cancelled" : "Rejected" };
    default:
      return { variant: "default", label: status };
  }
}

function present(value: string | null | undefined): value is string {
  return Boolean(value);
}

function requesterDisplay(req: BookingRequest): {
  name: string;
  sub: string;
} {
  if (req.is_guest_checkout) {
    const guestSub = [req.guest_company_name, req.guest_email]
      .filter(present)
      .join(" · ");
    return {
      name: req.guest_full_name || req.guest_email || "Guest",
      sub: guestSub || "Guest checkout",
    };
  }
  const memberSub = [
    req.member_company_name,
    req.member_email,
    req.booking_public_id ? `Booking ${req.booking_public_id}` : null,
  ]
    .filter(present)
    .join(" · ");
  return {
    name: req.member_name || req.member_email || "Member",
    sub: memberSub || (req.booking_public_id ? `Booking ${req.booking_public_id}` : "Member"),
  };
}

function titleize(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function spaceDisplay(req: BookingRequest): {
  name: string;
  sub: string;
  type: string | null;
} {
  const type = titleize(req.space_type);
  const location = [req.location_name, req.location_city]
    .filter(present)
    .filter((part, index, parts) => parts.indexOf(part) === index)
    .join(" · ");
  const fallbackSpace = req.space_public_id ? `Space ${req.space_public_id.slice(0, 8)}…` : "Space";

  if (req.membership_plan_name) {
    return {
      name: req.membership_plan_name,
      sub: [req.space_name || fallbackSpace, location].filter(present).join(" · ") || type || "Membership",
      type,
    };
  }

  return {
    name: req.space_name || fallbackSpace,
    sub: [location, type].filter(present).join(" · ") || "Room request",
    type,
  };
}

function compactNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function requestKindLabel(req: BookingRequest): string {
  switch (req.request_kind) {
    case "daily_booking":
      return "Day pass";
    case "membership_purchase":
      return "Membership";
    case "lease_purchase":
      return "Lease";
    default:
      return "Booking";
  }
}

function rateBasisLabel(rateBasis: string | null): string | null {
  switch (rateBasis) {
    case "hourly":
      return "Hourly";
    case "rule_hourly":
      return "Hourly promo";
    case "daily":
      return "Day rate";
    case "rule_daily":
      return "Day promo";
    case "capped_to_daily":
      return "Daily cap";
    case "monthly_fallback":
      return "Monthly fallback";
    default:
      return null;
  }
}

function priceDisplay(req: BookingRequest): {
  total: string;
  rate: string;
  detail: string;
} {
  const total = req.estimated_amount != null ? formatUsd(req.estimated_amount) : "—";
  const basis = req.rate_basis;
  const basePerUnit =
    req.base_amount_cents != null && req.units != null && req.units > 0
      ? req.base_amount_cents / 100 / req.units
      : null;
  const isRuleRate = basis === "rule_hourly" || basis === "rule_daily";
  const isHourly = basis === "hourly" || basis === "rule_hourly";
  const isMonthly = basis === "monthly_fallback";
  const unitSuffix = isMonthly ? "mo" : isHourly ? "hr" : "day";
  const unitLabel = isHourly ? "hour" : "day";
  const rateAmount: MoneyValue | null =
    isRuleRate && basePerUnit != null
      ? basePerUnit
      : isHourly
      ? req.price_hourly ?? basePerUnit
      : isMonthly
      ? req.price_monthly ?? basePerUnit
      : req.price_daily ?? basePerUnit;
  const rate = rateAmount != null ? `${formatUsd(rateAmount)}/${unitSuffix}` : "Rate unavailable";
  const basisLabel = rateBasisLabel(basis) || requestKindLabel(req);
  const units =
    req.units != null && req.units > 0
      ? `${compactNumber(req.units)} ${unitLabel}${req.units === 1 ? "" : "s"}`
      : null;
  return {
    total,
    rate,
    detail: [basisLabel, units].filter(Boolean).join(" · "),
  };
}

function timeRange(req: BookingRequest): string {
  try {
    const start = new Date(req.start_datetime);
    const end = new Date(req.end_datetime);
    const sameDay =
      start.getDate() === end.getDate() &&
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear();
    const startFmt = start.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const endFmt = end.toLocaleString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return sameDay ? `${startFmt} – ${endFmt}` : `${startFmt} → ${end.toLocaleString()}`;
  } catch {
    return "";
  }
}

function ageOf(req: BookingRequest): string {
  try {
    const start = new Date(req.start_datetime);
    const ms = start.getTime() - Date.now();
    const absMin = Math.round(Math.abs(ms) / 60000);
    if (absMin < 60) return ms > 0 ? `in ${absMin}m` : `${absMin}m ago`;
    const absHr = Math.round(absMin / 60);
    if (absHr < 24) return ms > 0 ? `in ${absHr}h` : `${absHr}h ago`;
    const absDay = Math.round(absHr / 24);
    return ms > 0 ? `in ${absDay}d` : `${absDay}d ago`;
  } catch {
    return "";
  }
}

export default function OwnerRequestsPage() {
  const searchParams = useSearchParams();
  const { getApiToken, isAuthReady } = useApiToken();
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [pendingDecision, setPendingDecision] = useState<{
    publicId: string;
    action: DecisionAction;
  } | null>(null);
  const handledDeepLink = useRef<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return bookings;
    return bookings.filter((b) => b.status === filter);
  }, [bookings, filter]);

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    for (const b of bookings) {
      byStatus[b.status] = (byStatus[b.status] || 0) + 1;
    }
    return byStatus;
  }, [bookings]);

  const load = useCallback(async () => {
    if (!isAuthReady) return;
    try {
      const token = (await getApiToken()) ?? undefined;
      if (!token) {
        setError("Sign in to review booking requests.");
        return;
      }
      setError(null);
      const list = await apiFetch<BookingRequest[]>(
        "/api/booking-requests",
        { method: "GET" },
        token
      );
      setBookings(list);
      setNotes(
        Object.fromEntries(list.map((request) => [request.public_id, request.operator_notes || ""]))
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [getApiToken, isAuthReady]);

  useEffect(() => {
    if (!isAuthReady) return;
    load().catch(() => null);
  }, [isAuthReady, load]);

  useEffect(() => {
    const publicId = searchParams.get("request");
    const decision = searchParams.get("decision");
    if (!publicId || (decision !== "approve" && decision !== "reject") || bookings.length === 0) {
      return;
    }
    const key = `${publicId}:${decision}`;
    if (handledDeepLink.current === key) return;
    const request = bookings.find((item) => item.public_id === publicId);
    if (!request || request.status !== "requested") return;
    handledDeepLink.current = key;
    setFilter("all");
    setPendingDecision({ publicId, action: decision });
    window.setTimeout(() => {
      document.getElementById(`request-${publicId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 0);
  }, [bookings, searchParams]);

  async function updateStatus(publicId: string, action: DecisionAction) {
    const token = (await getApiToken()) ?? undefined;
    if (!token) {
      setError("Sign in to update booking requests.");
      return;
    }
    setUpdating(publicId);
    try {
      setError(null);
      await apiFetch(
        `/api/booking-requests/${publicId}/${action}`,
        {
          method: "POST",
          body: JSON.stringify({ operator_notes: notes[publicId] || null }),
        },
        token
      );
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdating(null);
    }
  }

  async function retryPayment(publicId: string) {
    const token = (await getApiToken()) ?? undefined;
    if (!token) {
      setError("Sign in to retry booking request payments.");
      return;
    }
    setUpdating(publicId);
    try {
      setError(null);
      await apiFetch(
        `/api/booking-requests/${publicId}/retry-payment`,
        {
          method: "POST",
          body: JSON.stringify({ operator_notes: notes[publicId] || null }),
        },
        token
      );
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setUpdating(null);
    }
  }

  async function confirmPendingDecision() {
    if (!pendingDecision) return;
    const decision = pendingDecision;
    setPendingDecision(null);
    await updateStatus(decision.publicId, decision.action);
  }

  const pendingRequest = pendingDecision
    ? bookings.find((request) => request.public_id === pendingDecision.publicId)
    : null;
  const pendingRequester = pendingRequest ? requesterDisplay(pendingRequest) : null;
  const pendingRoom = pendingRequest ? spaceDisplay(pendingRequest) : null;

  return (
    <AppShell
      title="Requests"
      breadcrumb={["Owner", "Inbox"]}
    >
      <div className="text-[13px] text-text-3 mb-3.5">
        Review booking requests, capture operator notes, and decide what should be approved.
      </div>
      <div className="flex items-center gap-1 mb-3.5 border-b border-line">
        {FILTER_OPTIONS.map((option) => {
          const count =
            option.value === "all" ? bookings.length : counts[option.value] || 0;
          const active = filter === option.value;
          const urgent = option.tone === "danger" && count > 0;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-2.5 -mb-px border-b-2 text-[13px] transition-colors",
                active
                  ? "border-brand text-text font-semibold"
                  : "border-transparent text-text-3 font-medium hover:text-text-2"
              )}
            >
              {option.label}
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-px rounded-full text-[11px] font-semibold",
                  urgent
                    ? "bg-danger-soft text-danger"
                    : active
                    ? "bg-brand-soft text-brand"
                    : "bg-surface-2 text-text-3"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="mr-1">
          <SlidersHorizontal size={14} />
          Filters
        </Button>
        <Button variant="ghost" size="sm">
          Newest <ChevronDown size={11} />
        </Button>
      </div>

      {error ? (
        <div className="mb-3.5 text-[13px] text-danger">{error}</div>
      ) : null}

      {loading ? (
        <div className="text-[13px] text-text-3">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card className="text-[13px] text-text-3 text-center py-10">
          {bookings.length === 0
            ? "No requests yet."
            : "No requests match this filter."}
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="hidden lg:grid grid-cols-[1.35fr_1.6fr_1.15fr_1fr_110px_145px] gap-4 px-4 py-2.5 border-b border-line text-[11px] text-text-3 font-semibold uppercase tracking-[0.06em] bg-surface-2">
            <div>Member</div>
            <div>Space / room</div>
            <div>Date &amp; time</div>
            <div>Price / rate</div>
            <div>Status</div>
            <div className="text-right">Actions</div>
          </div>
          {filtered.map((request, i) => {
            const reqDisplay = requesterDisplay(request);
            const roomDisplay = spaceDisplay(request);
            const price = priceDisplay(request);
            const badge = statusToBadge(request.status);
            const range = timeRange(request);
            const isPending = request.status === "requested";
            const isFailed = request.status === "payment_failed";
            const paymentLine = `${request.payment_status || "Not charged"}${
              request.payment_provider ? ` · ${request.payment_provider}` : ""
            }`;
            return (
              <div
                key={request.public_id}
                id={`request-${request.public_id}`}
                data-testid={`request-row-${request.public_id}`}
                className={cn(
                  "grid lg:grid-cols-[1.35fr_1.6fr_1.15fr_1fr_110px_145px] grid-cols-1 px-4 py-4 items-start gap-3 lg:gap-4",
                  i > 0 && "border-t border-line"
                )}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <Avatar name={reqDisplay.name} size={36} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[13px] font-semibold truncate"
                        data-testid={`request-member-${request.public_id}`}
                      >
                        {reqDisplay.name}
                      </span>
                      {request.is_guest_checkout && (
                        <Badge variant="warning">Guest</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-text-3 truncate">
                      {reqDisplay.sub}
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="lg:hidden mb-1 text-[10px] uppercase tracking-[0.06em] text-text-3 font-semibold">
                    Space / room
                  </div>
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg bg-brand-soft text-brand">
                      <Building2 size={14} />
                    </div>
                    <div className="min-w-0">
                      <div
                        className="text-[13px] font-semibold text-text truncate"
                        data-testid={`request-space-${request.public_id}`}
                      >
                        {roomDisplay.name}
                      </div>
                      <div className="text-[11px] text-text-3 truncate">
                        {roomDisplay.sub}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="lg:hidden mb-1 text-[10px] uppercase tracking-[0.06em] text-text-3 font-semibold">
                    Date &amp; time
                  </div>
                  <div className="text-[12px] font-semibold text-text">{range || "—"}</div>
                  <div className="text-[11px] text-text-3">
                    {ageOf(request)}
                    {formatDeadline(request.cancellation_deadline_at) ? (
                      <>
                        {" · "}
                        <span title="Cancellation deadline">
                          cancel by {formatDeadline(request.cancellation_deadline_at)}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="lg:hidden mb-1 text-[10px] uppercase tracking-[0.06em] text-text-3 font-semibold">
                    Price / rate
                  </div>
                  <div
                    className="font-mono text-[14px] font-semibold text-text"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                    data-testid={`request-price-${request.public_id}`}
                  >
                    {price.total}
                  </div>
                  <div className="text-[11px] font-medium text-text-2">{price.rate}</div>
                  <div
                    className={cn(
                      "text-[10px] mt-px truncate",
                      isFailed ? "text-danger" : "text-text-3"
                    )}
                  >
                    {price.detail}
                    {" · "}
                    {paymentLine}
                  </div>
                </div>

                <div>
                  <div className="lg:hidden mb-1 text-[10px] uppercase tracking-[0.06em] text-text-3 font-semibold">
                    Status
                  </div>
                  <Badge variant={badge.variant} dot>
                    {badge.label}
                  </Badge>
                </div>
                <div className="flex gap-1.5 justify-start lg:justify-end">
                  {isPending && (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => updateStatus(request.public_id, "approve")}
                        disabled={updating === request.public_id}
                        className="bg-success border-success hover:bg-success/90 hover:border-success/90"
                      >
                        <Check size={12} strokeWidth={2.5} />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setPendingDecision({
                            publicId: request.public_id,
                            action: "reject",
                          })
                        }
                        className="w-auto px-2.5"
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {isFailed && (
                    <Button
                      size="sm"
                      variant="outline-danger"
                      onClick={() => retryPayment(request.public_id)}
                      disabled={updating === request.public_id}
                    >
                      Retry charge
                    </Button>
                  )}
                  {!isPending && !isFailed && (
                    <Button size="sm" variant="ghost">
                      View
                    </Button>
                  )}
                </div>
                <div className="lg:col-span-6 mt-1 grid gap-2">
                  {request.is_guest_checkout &&
                    (request.guest_email ||
                      request.guest_full_name ||
                      request.guest_phone ||
                      request.guest_company_name ||
                      request.guest_notes) && (
                      <div className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-[12px] text-warning">
                        <div className="text-[10px] uppercase tracking-[0.06em] font-semibold mb-1">
                          Guest contact
                        </div>
                        <div className="grid gap-1 text-text">
                          {request.guest_full_name ? (
                            <div className="flex items-start gap-2">
                              <Building2
                                size={12}
                                className="mt-0.5 text-text-3 flex-none"
                              />
                              <span>{request.guest_full_name}</span>
                            </div>
                          ) : null}
                          {request.guest_email ? (
                            <div className="flex items-start gap-2">
                              <Mail
                                size={12}
                                className="mt-0.5 text-text-3 flex-none"
                              />
                              <a
                                href={`mailto:${request.guest_email}`}
                                className="underline hover:no-underline"
                              >
                                {request.guest_email}
                              </a>
                            </div>
                          ) : null}
                          {request.guest_phone ? (
                            <div className="flex items-start gap-2">
                              <Phone
                                size={12}
                                className="mt-0.5 text-text-3 flex-none"
                              />
                              <a
                                href={`tel:${request.guest_phone}`}
                                className="underline hover:no-underline"
                              >
                                {request.guest_phone}
                              </a>
                            </div>
                          ) : null}
                          {request.guest_company_name ? (
                            <div className="flex items-start gap-2">
                              <Building2
                                size={12}
                                className="mt-0.5 text-text-3 flex-none"
                              />
                              <span>{request.guest_company_name}</span>
                            </div>
                          ) : null}
                          {request.guest_notes ? (
                            <div className="flex items-start gap-2">
                              <MessageSquare
                                size={12}
                                className="mt-0.5 text-text-3 flex-none"
                              />
                              <span className="whitespace-pre-line">
                                {request.guest_notes}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  {request.operator_notes ? (
                    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] text-text-2">
                      <span className="font-semibold text-text">Operator note: </span>
                      <span className="whitespace-pre-line">
                        {request.operator_notes}
                      </span>
                    </div>
                  ) : !request.is_guest_checkout && request.guest_notes ? (
                    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] text-text-2">
                      <span className="font-semibold text-text">Request note: </span>
                      <span className="whitespace-pre-line">{request.guest_notes}</span>
                    </div>
                  ) : null}
                  <label
                    className="text-[11px] text-text-3"
                    htmlFor={`note-${request.public_id}`}
                  >
                    Operator notes
                  </label>
                  <textarea
                    id={`note-${request.public_id}`}
                    value={notes[request.public_id] || ""}
                    onChange={(e) =>
                      setNotes((current) => ({
                        ...current,
                        [request.public_id]: e.target.value,
                      }))
                    }
                    rows={1}
                    disabled={!isPending && !isFailed}
                    className="w-full min-h-10 rounded-xl border border-line-strong bg-surface px-3 py-2 text-[13px] text-text outline-none transition focus:border-brand focus-visible:shadow-ring disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Add notes for the member or your internal team"
                  />
                </div>
                {isFailed && (
                  <div className="lg:col-span-6 mt-2 rounded-xl border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">
                    <div className="font-semibold">Payment failed</div>
                    <div className="mt-1">
                      {request.failure_reason || FAILURE_FALLBACK}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {/* Pagination strip — visual only, real pagination not yet supported by /api/booking-requests */}
      {/* HANDOFF: pagination requires server-side limit/offset on /api/booking-requests. */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between mt-3 text-[12px] text-text-3">
          <div>
            Showing {filtered.length} of {bookings.length} requests
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" disabled>
              <ChevronLeft size={12} />
            </Button>
            <Button
              variant="default"
              size="sm"
              className="bg-brand-soft text-brand border-brand-soft"
            >
              1
            </Button>
            <Button variant="ghost" size="sm" disabled>
              <ChevronRight size={12} />
            </Button>
          </div>
        </div>
      )}

      {/* Top action shortcuts (Filters/Export) — kept inline above tabs in case AppShell topbar isn't extensible per page yet */}
      <div className="hidden">
        <Mail aria-hidden />
        <FileText aria-hidden />
        <X aria-hidden />
      </div>

      {pendingDecision && pendingRequest ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal
        >
          <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-pop border border-line">
            <div className="text-[18px] font-semibold tracking-[-0.01em]">
              {pendingDecision.action === "approve"
                ? "Approve request"
                : "Reject request"}
            </div>
            <div className="mt-1.5 text-[13px] text-text-3">
              {pendingRequester?.name}&apos;s request for {pendingRoom?.name} on{" "}
              {timeRange(pendingRequest)}.
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="default"
                onClick={() => setPendingDecision(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={pendingDecision.action === "approve" ? "primary" : "outline-danger"}
                onClick={confirmPendingDecision}
                disabled={updating === pendingDecision.publicId}
              >
                {pendingDecision.action === "approve" ? "Approve" : "Reject"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
