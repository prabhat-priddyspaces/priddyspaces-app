"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAccessToken } from "@/lib/auth";
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

type StatusFilter = "all" | "requested" | "approved" | "payment_failed" | "rejected" | "cancelled";
type DecisionAction = "approve" | "reject";

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "requested", label: "Requested" },
  { value: "approved", label: "Approved" },
  { value: "payment_failed", label: "Payment failed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export default function OwnerRequestsPage() {
  const searchParams = useSearchParams();
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

  async function load() {
    try {
      const token = getAccessToken() ?? undefined;
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
  }

  useEffect(() => {
    load().catch(() => null);
  }, []);

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

  async function updateStatus(publicId: string, action: "approve" | "reject") {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setUpdating(publicId);
    try {
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
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setUpdating(publicId);
    try {
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
    <AppShell>
      <div className="grid gap-6">
        <div>
          <h2 className="text-2xl font-semibold">Requests</h2>
          <p className="text-textSecondary">
            Review booking requests, capture operator notes, and decide what should be approved.
          </p>
        </div>
        {error ? <div className="text-sm text-error">{error}</div> : null}
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((option) => {
            const count = option.value === "all" ? bookings.length : counts[option.value] || 0;
            const active = filter === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  active
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-textSecondary hover:border-accent/50"
                }`}
              >
                {option.label} ({count})
              </button>
            );
          })}
        </div>
        {loading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : filtered.length === 0 ? (
          <Card>
            <div className="p-6 text-center text-sm text-textMuted">
              {bookings.length === 0 ? "No requests yet." : "No requests match this filter."}
            </div>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filtered.map((request) => (
              <Card key={request.public_id} id={`request-${request.public_id}`} className="p-4">
                <div className="grid gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-textPrimary">
                          Request {request.public_id.slice(0, 8)}...
                        </span>
                        {request.is_guest_checkout ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                            Guest
                          </span>
                        ) : null}
                      </div>
                      <div className="text-textSecondary">
                        {new Date(request.start_datetime).toLocaleString()} -{" "}
                        {new Date(request.end_datetime).toLocaleString()}
                      </div>
                      <div className="mt-1 text-textMuted">Status: {request.status}</div>
                      <div className="mt-1 text-textMuted">
                        Payment: {request.payment_status || "not charged"}
                        {request.payment_provider ? ` • ${request.payment_provider}` : ""}
                      </div>
                      {request.cancellation_deadline_at ? (
                        <div className="mt-1 text-textMuted">
                          Cancellation deadline: {new Date(request.cancellation_deadline_at).toLocaleString()}
                        </div>
                      ) : null}
                      {request.estimated_amount != null ? (
                        <div className="mt-1 text-textMuted">
                          Estimated amount: {formatUsd(request.estimated_amount)}
                        </div>
                      ) : null}
                      {request.booking_public_id ? (
                        <div className="mt-1 text-textMuted">
                          Booking created: {request.booking_public_id}
                        </div>
                      ) : null}
                    </div>
                    {request.status === "requested" ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => updateStatus(request.public_id, "approve")}
                          disabled={updating === request.public_id}
                        >
                          {updating === request.public_id ? "Charging..." : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => updateStatus(request.public_id, "reject")}
                          disabled={updating === request.public_id}
                        >
                          Deny
                        </Button>
                      </div>
                    ) : null}
                    {request.status === "payment_failed" ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => retryPayment(request.public_id)}
                          disabled={updating === request.public_id}
                        >
                          {updating === request.public_id ? "Retrying..." : "Retry charge"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {request.is_guest_checkout && (request.guest_email || request.guest_full_name) ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                      <div className="mb-2 font-semibold text-amber-800">Guest contact</div>
                      <div className="grid gap-1 text-amber-900">
                        {request.guest_full_name ? (
                          <div><span className="font-medium">Name:</span> {request.guest_full_name}</div>
                        ) : null}
                        {request.guest_email ? (
                          <div>
                            <span className="font-medium">Email:</span>{" "}
                            <a href={`mailto:${request.guest_email}`} className="underline hover:no-underline">
                              {request.guest_email}
                            </a>
                          </div>
                        ) : null}
                        {request.guest_phone ? (
                          <div><span className="font-medium">Phone:</span> {request.guest_phone}</div>
                        ) : null}
                        {request.guest_company_name ? (
                          <div><span className="font-medium">Company:</span> {request.guest_company_name}</div>
                        ) : null}
                        {request.guest_notes ? (
                          <div><span className="font-medium">Message:</span> {request.guest_notes}</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {request.status === "payment_failed" ? (
                    <div className="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">
                      <div className="font-medium">Payment failed</div>
                      <div className="mt-1">
                        {request.failure_reason ||
                          "Approval was saved as payment failed because the saved card could not be charged."}
                      </div>
                    </div>
                  ) : null}
                  <div className="grid gap-2">
                    <label className="text-xs text-textMuted">Operator notes</label>
                    <textarea
                      value={notes[request.public_id] || ""}
                      onChange={(e) =>
                        setNotes((current) => ({ ...current, [request.public_id]: e.target.value }))
                      }
                      rows={3}
                      className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-textPrimary"
                      placeholder="Add notes for the member or your internal team"
                      disabled={request.status !== "requested" && request.status !== "payment_failed"}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      {pendingDecision && pendingRequest ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-md border border-border bg-surface p-5 shadow-xl">
            <div className="text-lg font-semibold text-textPrimary">
              {pendingDecision.action === "approve" ? "Approve request" : "Reject request"}
            </div>
            <div className="mt-2 text-sm text-textSecondary">
              Request {pendingRequest.public_id.slice(0, 8)}... for{" "}
              {new Date(pendingRequest.start_datetime).toLocaleString()}.
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPendingDecision(null)}>
                Cancel
              </Button>
              <Button
                type="button"
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
