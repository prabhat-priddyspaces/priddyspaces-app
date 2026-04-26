"use client";

import { useEffect, useState } from "react";

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
  estimated_amount: number | null;
  operator_notes: string | null;
}

export default function OwnerRequestsPage() {
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

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

  async function updateStatus(publicId: string, status: "approved" | "rejected") {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setUpdating(publicId);
    try {
      await apiFetch(
        `/api/booking-requests/${publicId}/${status}`,
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
        {loading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : bookings.length === 0 ? (
          <Card>
            <div className="p-6 text-center text-sm text-textMuted">No requests yet.</div>
          </Card>
        ) : (
          <div className="grid gap-4">
            {bookings.map((request) => (
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
                          onClick={() => updateStatus(request.public_id, "approved")}
                          disabled={updating === request.public_id}
                        >
                          {updating === request.public_id ? "..." : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => updateStatus(request.public_id, "rejected")}
                          disabled={updating === request.public_id}
                        >
                          Deny
                        </Button>
                      </div>
                    ) : null}
                  </div>
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
                      disabled={request.status !== "requested"}
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
