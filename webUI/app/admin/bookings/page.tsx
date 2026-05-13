"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { formatAdminDateTime, formatAdminLabel } from "@/lib/admin-format";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface ActivityRecord {
  public_id: string;
  status: string;
  member_name: string | null;
  member_email: string | null;
  space_name: string | null;
  space_type: string | null;
  location_name: string | null;
  organization_name: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  created_at: string | null;
}

interface BookingActivityResponse {
  bookings: ActivityRecord[];
  booking_requests: Array<ActivityRecord & { operator_notes: string | null; request_kind: string | null }>;
}

function personLabel(item: ActivityRecord) {
  return item.member_name || item.member_email || "Guest";
}

function inventoryLabel(item: ActivityRecord) {
  return [item.organization_name, item.location_name, item.space_name || formatAdminLabel(item.space_type)]
    .filter(Boolean)
    .join(" / ");
}

function timeWindowLabel(item: ActivityRecord) {
  if (!item.start_datetime && !item.end_datetime) return "No booking window";
  return `${formatAdminDateTime(item.start_datetime)} to ${formatAdminDateTime(item.end_datetime)}`;
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
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Bookings & Requests</h2>
          <p className="text-text-2">Recent booking and request activity across the platform.</p>
        </div>
        {message ? <div className="text-sm text-danger">{message}</div> : null}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-4">
            <div className="font-semibold text-text">Bookings</div>
            <div className="mt-4 grid gap-3">
              {data?.bookings.length ? (
                data.bookings.map((booking) => (
                  <div key={booking.public_id} className="rounded-md border border-line p-3 text-sm">
                    <div className="font-medium text-text">{personLabel(booking)}</div>
                    <div className="text-text-3">{booking.member_email || "No email"}</div>
                    <div className="mt-2 text-text-2">{inventoryLabel(booking) || "No location details"}</div>
                    <div className="text-text-3">{formatAdminLabel(booking.status)} • {timeWindowLabel(booking)}</div>
                    <div className="mt-1 text-xs text-text-3">
                      Created {formatAdminDateTime(booking.created_at)} • ID {booking.public_id}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-text-3">No bookings found.</div>
              )}
            </div>
          </Card>
          <Card className="p-4">
            <div className="font-semibold text-text">Booking Requests</div>
            <div className="mt-4 grid gap-3">
              {data?.booking_requests.length ? (
                data.booking_requests.map((request) => (
                  <div key={request.public_id} className="rounded-md border border-line p-3 text-sm">
                    <div className="font-medium text-text">{personLabel(request)}</div>
                    <div className="text-text-3">{request.member_email || "No email"}</div>
                    <div className="mt-2 text-text-2">{inventoryLabel(request) || "No location details"}</div>
                    <div className="text-text-3">
                      {formatAdminLabel(request.status)} • {formatAdminLabel(request.request_kind)} • {timeWindowLabel(request)}
                    </div>
                    {request.operator_notes ? (
                      <div className="mt-1 text-text-2">Notes: {request.operator_notes}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-text-3">
                      Created {formatAdminDateTime(request.created_at)} • ID {request.public_id}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-text-3">No booking requests found.</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
