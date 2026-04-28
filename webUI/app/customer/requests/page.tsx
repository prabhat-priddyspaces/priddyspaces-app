"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAccessToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

interface BookingRequest {
  public_id: string;
  booking_id: number | null;
  booking_public_id: string | null;
  estimated_amount: number | null;
  start_datetime: string;
  end_datetime: string;
  status: string;
  payment_status: string | null;
  payment_provider: string | null;
  cancellation_deadline_at: string | null;
}

export default function CustomerRequestsPage() {
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
  async function load() {
    try {
      const token = getAccessToken() ?? undefined;
      const list = await apiFetch<BookingRequest[]>("/api/booking-requests", { method: "GET" }, token);
      setBookings(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }
    load();
  }, []);

  async function refreshRequests() {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    const list = await apiFetch<BookingRequest[]>("/api/booking-requests", { method: "GET" }, token);
    setBookings(list);
  }

  async function cancelRequest(publicId: string) {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setCancelling(publicId);
    setError(null);
    try {
      await apiFetch(`/api/booking-requests/${publicId}/cancel`, { method: "POST" }, token);
      await refreshRequests();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to cancel request");
    } finally {
      setCancelling(null);
    }
  }

  function canCancel(request: BookingRequest) {
    if (request.status === "requested" || request.status === "payment_failed") return true;
    if (request.status !== "approved") return false;
    if (!request.cancellation_deadline_at) return false;
    return new Date() <= new Date(request.cancellation_deadline_at);
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-textPrimary">My requests</h1>
            <p className="mt-1 text-textSecondary">
              View status of your booking requests.
            </p>
          </div>
          <Link href="/customer">
            <Button variant="secondary">Find a space</Button>
          </Link>
        </div>
        {error ? (
          <p className="mt-4 text-sm text-error">{error}</p>
        ) : null}
        {loading ? (
          <p className="mt-6 text-sm text-textMuted">Loading...</p>
        ) : bookings.length === 0 ? (
          <Card className="mt-6 p-6">
            <p className="text-center text-sm text-textMuted">No bookings yet.</p>
            <Link href="/customer" className="mt-4 flex justify-center">
              <Button size="sm">Find a space</Button>
            </Link>
          </Card>
        ) : (
          <div className="mt-6 grid gap-4">
            {bookings.map((b) => (
              <Card key={b.public_id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm">
                    <div className="font-medium text-textPrimary">
                      {new Date(b.start_datetime).toLocaleString()} –{" "}
                      {new Date(b.end_datetime).toLocaleString()}
                    </div>
                    <div className="mt-1 text-textMuted">
                      Status: <span className="capitalize">{b.status}</span>
                    </div>
                    <div className="mt-1 text-textMuted">
                      Payment: <span className="capitalize">{b.payment_status || "not charged"}</span>
                      {b.payment_provider ? ` • ${b.payment_provider}` : ""}
                    </div>
                    {b.cancellation_deadline_at ? (
                      <div className="mt-1 text-textMuted">
                        Cancel by {new Date(b.cancellation_deadline_at).toLocaleString()}
                      </div>
                    ) : null}
                    {b.estimated_amount != null ? (
                      <div className="mt-1 text-textMuted">
                        Estimated: ${b.estimated_amount}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/customer/requests/${b.public_id}`}>
                      <Button size="sm" variant="secondary">
                        View details
                      </Button>
                    </Link>
                    {canCancel(b) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => cancelRequest(b.public_id)}
                        disabled={cancelling === b.public_id}
                      >
                        {cancelling === b.public_id ? "Cancelling..." : "Cancel"}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {b.status === "payment_failed" ? (
                  <div className="mt-3 rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">
                    Payment failed when the owner approved this request. The owner can retry the charge after you update your payment method.
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
