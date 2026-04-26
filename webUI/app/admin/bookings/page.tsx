"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface ActivityRecord {
  public_id: string;
  status: string;
  customer_email: string | null;
  created_at: string | null;
}

interface BookingActivityResponse {
  bookings: ActivityRecord[];
  booking_requests: Array<ActivityRecord & { operator_notes: string | null }>;
}

export default function AdminBookingsPage() {
  const [data, setData] = useState<BookingActivityResponse | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<BookingActivityResponse>("/api/admin/bookings", { method: "GET" }, token)
      .then(setData)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load booking activity"));
  }, []);

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-textPrimary">Bookings & Requests</h2>
          <p className="text-textSecondary">Recent booking and request activity across the platform.</p>
        </div>
        {message ? <div className="text-sm text-error">{message}</div> : null}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-4">
            <div className="font-semibold text-textPrimary">Bookings</div>
            <div className="mt-4 grid gap-3">
              {data?.bookings.length ? (
                data.bookings.map((booking) => (
                  <div key={booking.public_id} className="rounded-md border border-border p-3 text-sm">
                    <div className="font-medium text-textPrimary">{booking.public_id}</div>
                    <div className="text-textMuted">{booking.customer_email}</div>
                    <div className="text-textMuted">{booking.status}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-textMuted">No bookings found.</div>
              )}
            </div>
          </Card>
          <Card className="p-4">
            <div className="font-semibold text-textPrimary">Booking Requests</div>
            <div className="mt-4 grid gap-3">
              {data?.booking_requests.length ? (
                data.booking_requests.map((request) => (
                  <div key={request.public_id} className="rounded-md border border-border p-3 text-sm">
                    <div className="font-medium text-textPrimary">{request.public_id}</div>
                    <div className="text-textMuted">{request.customer_email}</div>
                    <div className="text-textMuted">
                      {request.status}
                      {request.operator_notes ? ` • ${request.operator_notes}` : ""}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-textMuted">No booking requests found.</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
