"use client";

import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAccessToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

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
  estimated_amount: number | null;
  operator_notes: string | null;
  failure_reason: string | null;
}

type StatusFilter = "all" | "requested" | "approved" | "payment_failed" | "rejected" | "cancelled";

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "requested", label: "Requested" },
  { value: "approved", label: "Approved" },
  { value: "payment_failed", label: "Payment failed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export default function OwnerRequestsPage() {
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<StatusFilter>("all");

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
              <Card key={request.public_id} className="p-4">
                <div className="grid gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="text-sm">
                      <div className="font-medium text-textPrimary">
                        Request {request.public_id.slice(0, 8)}...
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
                          Estimated amount: ${request.estimated_amount}
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
                      placeholder="Add notes for the customer or your internal team"
                      disabled={request.status !== "requested" && request.status !== "payment_failed"}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
