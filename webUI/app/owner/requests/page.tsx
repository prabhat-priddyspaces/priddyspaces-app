"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Mail,
  MoreHorizontal,
  SlidersHorizontal,
  X,
} from "lucide-react";

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

function requesterDisplay(req: BookingRequest): {
  name: string;
  sub: string;
} {
  if (req.is_guest_checkout) {
    return {
      name: req.guest_full_name || req.guest_email || "Guest",
      sub: req.guest_company_name || req.guest_email || "Guest checkout",
    };
  }
  return {
    name: `Request ${req.public_id.slice(0, 8)}…`,
    sub: req.booking_public_id ? `Booking ${req.booking_public_id}` : "Member",
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
          <div className="hidden md:grid grid-cols-[1.6fr_1.2fr_1fr_120px_120px_140px] px-4 py-2.5 border-b border-line text-[11px] text-text-3 font-semibold uppercase tracking-[0.06em] bg-surface-2">
            <div>Requester</div>
            <div>Space &amp; time</div>
            <div>Note</div>
            <div>Payment</div>
            <div>Status</div>
            <div className="text-right">Actions</div>
          </div>
          {filtered.map((request, i) => {
            const reqDisplay = requesterDisplay(request);
            const badge = statusToBadge(request.status);
            const range = timeRange(request);
            const isPending = request.status === "requested";
            const isFailed = request.status === "payment_failed";
            return (
              <div
                key={request.public_id}
                id={`request-${request.public_id}`}
                className={cn(
                  "grid md:grid-cols-[1.6fr_1.2fr_1fr_120px_120px_140px] grid-cols-1 px-4 py-3 items-center gap-2",
                  i > 0 && "border-t border-line"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={reqDisplay.name} size={32} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold truncate">
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
                <div>
                  <div className="text-[12px] font-medium">{range || "—"}</div>
                  <div className="text-[11px] text-text-3">
                    {ageOf(request)}
                  </div>
                </div>
                <div className="text-[12px] text-text-2 leading-snug min-w-0 truncate">
                  {request.operator_notes ? (
                    request.operator_notes
                  ) : request.guest_notes ? (
                    request.guest_notes
                  ) : (
                    <span className="text-text-4">No note</span>
                  )}
                </div>
                <div>
                  <div
                    className="font-mono text-[13px] font-semibold"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {request.estimated_amount != null
                      ? formatUsd(request.estimated_amount)
                      : "—"}
                  </div>
                  <div
                    className={cn(
                      "text-[10px] mt-px",
                      isFailed ? "text-danger" : "text-text-3"
                    )}
                  >
                    {request.payment_status || "Not charged"}
                    {request.payment_provider ? ` · ${request.payment_provider}` : ""}
                  </div>
                </div>
                <div>
                  <Badge variant={badge.variant} dot>
                    {badge.label}
                  </Badge>
                </div>
                <div className="flex gap-1.5 justify-end">
                  {isPending && (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() =>
                          setPendingDecision({
                            publicId: request.public_id,
                            action: "approve",
                          })
                        }
                        disabled={updating === request.public_id}
                        className="bg-success border-success hover:bg-success/90 hover:border-success/90"
                      >
                        <Check size={12} strokeWidth={2.5} />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="More"
                        onClick={() =>
                          setPendingDecision({
                            publicId: request.public_id,
                            action: "reject",
                          })
                        }
                        className="w-7 p-0 justify-center"
                      >
                        <MoreHorizontal size={14} />
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
                {/* Operator notes (collapsed; only show editor for actionable rows) */}
                {(isPending || isFailed) && (
                  <div className="md:col-span-6 mt-2 grid gap-1.5">
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
                      rows={2}
                      className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[13px] text-text outline-none transition focus:border-brand focus-visible:shadow-ring"
                      placeholder="Add notes for the member or your internal team"
                    />
                  </div>
                )}
                {isFailed && request.failure_reason && (
                  <div className="md:col-span-6 mt-2 rounded-xl border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">
                    <div className="font-semibold">Payment failed</div>
                    <div className="mt-1">{request.failure_reason}</div>
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
              Request {pendingRequest.public_id.slice(0, 8)}… for{" "}
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
