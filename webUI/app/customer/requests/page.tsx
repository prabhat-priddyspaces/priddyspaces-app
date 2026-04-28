"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PaymentModal } from "@/components/payment-modal";
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
}

function requestNextStep(request: BookingRequest) {
  if (request.status === "requested") {
    return "Waiting for the owner to review this request.";
  }
  if (request.status === "approved" && request.booking_public_id) {
    return "Approved. Complete payment to confirm the booking.";
  }
  if (request.status === "rejected") {
    return "The owner declined this request. Choose another time or space.";
  }
  return "Open the details page for the latest payment and invoice status.";
}

export default function CustomerRequestsPage() {
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<{ id: string; amount: number } | null>(null);

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
                    <div className="mt-1 text-textMuted">{requestNextStep(b)}</div>
                    {b.estimated_amount != null ? (
                      <div className="mt-1 text-textMuted">
                        Estimated: ${b.estimated_amount}
                      </div>
                    ) : null}
                  </div>
                  <Link href={`/customer/requests/${b.public_id}`}>
                    <Button size="sm" variant="secondary">
                      View details
                    </Button>
                  </Link>
                </div>
                {b.status === "approved" &&
                b.booking_public_id != null &&
                b.estimated_amount != null ? (
                  <Button
                    size="sm"
                    onClick={() => setPaying({ id: b.booking_public_id!, amount: b.estimated_amount! })}
                  >
                    Pay now
                  </Button>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>
      {paying ? (
        <PaymentModal
          open={true}
          bookingPublicId={paying.id}
          amount={paying.amount}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            refreshRequests().catch(() => null);
            window.location.href = "/customer/payments/success";
          }}
        />
      ) : null}
    </main>
  );
}
