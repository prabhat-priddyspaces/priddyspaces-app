"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAccessToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { formatUsd, type MoneyValue } from "@/lib/money";
import { PaymentMethodModal } from "@/components/payment-method-modal";

interface BookingRequest {
  public_id: string;
  created_at: string | null;
  booking_id: number | null;
  booking_public_id: string | null;
  space_public_id: string | null;
  space_name: string | null;
  space_type: string | null;
  organization_name: string | null;
  location_public_id: string | null;
  location_name: string | null;
  location_address: string | null;
  location_city: string | null;
  location_state: string | null;
  location_postal_code: string | null;
  location_timezone: string | null;
  location_public_phone: string | null;
  location_public_email: string | null;
  support_contacts: Array<{ name: string; title: string }>;
  estimated_amount: MoneyValue | null;
  start_datetime: string;
  end_datetime: string;
  status: string;
  payment_status: string | null;
  payment_provider: string | null;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  payment_method_exp_month: number | null;
  payment_method_exp_year: number | null;
  instant_booking: boolean;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  cancellation_deadline_at: string | null;
  payment_hold_expires_at: string | null;
  payment_failed_at: string | null;
  booking_approval_mode: string;
  payment_failure_hold_minutes: number | null;
  failure_reason: string | null;
}

interface BookingWaitlistEntry {
  public_id: string;
  created_at: string | null;
  status: string;
  space_public_id: string | null;
  space_name: string | null;
  space_type: string | null;
  organization_name: string | null;
  location_name: string | null;
  location_city: string | null;
  membership_plan_name: string | null;
  request_kind: string;
  booking_mode: string | null;
  seats_requested: number;
  start_datetime: string | null;
  end_datetime: string | null;
  desired_start_date: string | null;
  invited_at: string | null;
  invite_expires_at: string | null;
  booking_href: string | null;
}

function memberRequestDetailHref(publicId: string) {
  return `/member/requests/${encodeURIComponent(publicId)}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString();
}

function formatStatus(value: string | null | undefined) {
  return (value || "unknown").replaceAll("_", " ");
}

function formatSpaceType(value: string | null | undefined) {
  if (!value) return "Space";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAddress(request: BookingRequest) {
  const locality = [request.location_city, request.location_state, request.location_postal_code]
    .filter(Boolean)
    .join(", ");
  return [request.location_address, locality].filter(Boolean).join(" ");
}

function contactLine(request: BookingRequest) {
  const contact = request.support_contacts?.[0];
  const parts = [
    contact ? `${contact.name} (${contact.title})` : null,
    request.location_public_phone,
    request.location_public_email,
  ].filter(Boolean);
  return parts.join(" • ");
}

function decisionLine(request: BookingRequest) {
  if (request.status === "approved" && request.approved_at) {
    return `Approved at ${formatDateTime(request.approved_at)}`;
  }
  if (request.status === "rejected" && request.rejected_at) {
    return `Rejected at ${formatDateTime(request.rejected_at)}`;
  }
  if (request.status === "cancelled" && request.cancelled_at) {
    return `Cancelled at ${formatDateTime(request.cancelled_at)}`;
  }
  return null;
}

function cardLine(request: BookingRequest) {
  if (!request.payment_method_last4) return null;
  const brand = formatSpaceType(request.payment_method_brand || "card");
  const expiry =
    request.payment_method_exp_month != null && request.payment_method_exp_year != null
      ? ` · Expires ${String(request.payment_method_exp_month).padStart(2, "0")}/${request.payment_method_exp_year}`
      : "";
  return `${brand} ending in ${request.payment_method_last4}${expiry}`;
}

function paymentFailureReason(reason: string | null) {
  const text = (reason || "").trim();
  if (!text || ["0", "failed", "payment failed"].includes(text.toLowerCase())) {
    return "The payment processor declined the charge. Update the card or contact the card issuer for details.";
  }
  return text;
}

function holdDeadlineLine(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function holdExpired(request: BookingRequest) {
  if (request.status === "cancelled" && request.payment_status === "failed") return true;
  if (!request.payment_hold_expires_at) return false;
  return Date.now() > new Date(request.payment_hold_expires_at).getTime();
}

function retryOwnerName(request: BookingRequest) {
  return request.organization_name?.trim() || "the owner";
}

export default function MemberRequestsPage() {
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [waitlist, setWaitlist] = useState<BookingWaitlistEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [paymentUpdateRequest, setPaymentUpdateRequest] = useState<BookingRequest | null>(null);
  const [updatingPayment, setUpdatingPayment] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const token = getAccessToken() ?? undefined;
        const [requestList, waitlistList] = await Promise.all([
          apiFetch<BookingRequest[]>("/api/booking-requests", { method: "GET" }, token),
          apiFetch<BookingWaitlistEntry[]>("/api/booking-waitlist", { method: "GET" }, token),
        ]);
        setBookings(requestList);
        setWaitlist(waitlistList);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unable to load booking requests");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function refreshRequests() {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    const [requestList, waitlistList] = await Promise.all([
      apiFetch<BookingRequest[]>("/api/booking-requests", { method: "GET" }, token),
      apiFetch<BookingWaitlistEntry[]>("/api/booking-waitlist", { method: "GET" }, token),
    ]);
    setBookings(requestList);
    setWaitlist(waitlistList);
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

  async function cancelWaitlist(publicId: string) {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setCancelling(publicId);
    setError(null);
    try {
      await apiFetch(`/api/booking-waitlist/${publicId}/cancel`, { method: "POST" }, token);
      await refreshRequests();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to cancel waitlist entry");
    } finally {
      setCancelling(null);
    }
  }

  async function handlePaymentMethodSaved(paymentMethodPublicId: string) {
    if (!paymentUpdateRequest) return;
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setUpdatingPayment(true);
    setError(null);
    try {
      await apiFetch(
        `/api/booking-requests/${paymentUpdateRequest.public_id}/payment-method`,
        {
          method: "POST",
          body: JSON.stringify({
            member_owner_payment_method_public_id: paymentMethodPublicId,
            payment_authorization_consent: true,
          }),
        },
        token,
      );
      if (paymentUpdateRequest.instant_booking) {
        await apiFetch(
          `/api/booking-requests/${paymentUpdateRequest.public_id}/retry-payment`,
          { method: "POST", body: JSON.stringify({ operator_notes: null }) },
          token,
        );
      }
      await refreshRequests();
      setPaymentUpdateRequest(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to update payment method");
    } finally {
      setUpdatingPayment(false);
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
            <h1 className="text-2xl font-semibold text-textPrimary">My booking requests</h1>
            <p className="mt-1 text-textSecondary">
              Track approvals, payment holds, cancellations, and host contact details.
            </p>
          </div>
          <Link href="/member">
            <Button variant="secondary">Find a workspace</Button>
          </Link>
        </div>
        {error ? (
          <p className="mt-4 text-sm text-error">{error}</p>
        ) : null}
        {loading ? (
          <p className="mt-6 text-sm text-textMuted">Loading booking requests...</p>
        ) : bookings.length === 0 && waitlist.length === 0 ? (
          <Card className="mt-6 p-6">
            <p className="text-center text-sm text-textMuted">No booking requests yet.</p>
            <Link href="/member" className="mt-4 flex justify-center">
              <Button size="sm">Browse available spaces</Button>
            </Link>
          </Card>
        ) : (
          <div className="mt-6 grid gap-4">
            {waitlist.map((entry) => (
              <Card key={entry.public_id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm">
                    <div className="font-medium text-textPrimary">
                      {entry.space_name || formatSpaceType(entry.space_type)}
                    </div>
                    <div className="mt-1 text-textMuted">
                      Waitlist • {formatSpaceType(entry.space_type)}
                      {entry.location_name ? ` • ${entry.location_name}` : ""}
                      {entry.location_city ? ` • ${entry.location_city}` : ""}
                    </div>
                    {entry.membership_plan_name ? (
                      <div className="mt-1 text-textMuted">Plan: {entry.membership_plan_name}</div>
                    ) : null}
                    <div className="mt-1 text-textMuted">
                      {entry.desired_start_date
                        ? `Desired start: ${entry.desired_start_date}`
                        : `Requested: ${formatDateTime(entry.start_datetime)} – ${formatDateTime(entry.end_datetime)}`}
                    </div>
                    <div className="mt-1 text-textMuted">
                      Status: <span className="capitalize">{formatStatus(entry.status)}</span>
                    </div>
                    {entry.invite_expires_at ? (
                      <div className="mt-1 text-textMuted">
                        Invite expires: {formatDateTime(entry.invite_expires_at)}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {entry.status === "invited" && entry.booking_href ? (
                      <Link href={entry.booking_href}>
                        <Button size="sm">Book now</Button>
                      </Link>
                    ) : null}
                    {entry.status === "waitlisted" || entry.status === "invited" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => cancelWaitlist(entry.public_id)}
                        disabled={cancelling === entry.public_id}
                      >
                        {cancelling === entry.public_id ? "Cancelling..." : "Cancel waitlist"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
            {bookings.map((b) => (
              <Card key={b.public_id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm">
                    <div className="font-medium text-textPrimary">
                      {b.space_name || formatSpaceType(b.space_type)}
                    </div>
                    <div className="mt-1 text-textMuted">
                      {formatSpaceType(b.space_type)}
                      {b.location_name ? ` • ${b.location_name}` : ""}
                    </div>
                    {formatAddress(b) ? (
                      <div className="mt-1 text-textMuted">Location: {formatAddress(b)}</div>
                    ) : null}
                    <div className="mt-1 text-textMuted">
                      Booking: {formatDateTime(b.start_datetime)} – {formatDateTime(b.end_datetime)}
                    </div>
                    <div className="mt-1 text-textMuted">
                      Request sent: {formatDateTime(b.created_at)}
                    </div>
                    <div className="mt-1 text-textMuted">
                      Status: <span className="capitalize">{formatStatus(b.status)}</span>
                    </div>
                    {decisionLine(b) ? (
                      <div className="mt-1 text-textMuted">{decisionLine(b)}</div>
                    ) : null}
                    <div className="mt-1 text-textMuted">
                      Payment: <span className="capitalize">{formatStatus(b.payment_status || "not charged")}</span>
                    </div>
                    {cardLine(b) ? <div className="mt-1 text-textMuted">{cardLine(b)}</div> : null}
                    {b.cancellation_deadline_at ? (
                      <div className="mt-1 text-textMuted">
                        Cancel by {new Date(b.cancellation_deadline_at).toLocaleString()}
                      </div>
                    ) : null}
                    {b.estimated_amount != null ? (
                      <div className="mt-1 text-textMuted">
                        Estimated: {formatUsd(b.estimated_amount)}
                      </div>
                    ) : null}
                    {contactLine(b) ? (
                      <div className="mt-1 text-textMuted">Contact: {contactLine(b)}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={memberRequestDetailHref(b.public_id)}>
                      <Button size="sm" variant="secondary">
                        View booking request
                      </Button>
                    </Link>
                    {canCancel(b) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => cancelRequest(b.public_id)}
                        disabled={cancelling === b.public_id}
                      >
                        {cancelling === b.public_id ? "Cancelling request..." : "Cancel booking request"}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {b.status === "cancelled" && b.payment_status === "failed" ? (
                  <div className="mt-3 rounded-md border border-border bg-surface2 p-3 text-sm text-textSecondary">
                    This hold expired. Start a new booking.
                  </div>
                ) : null}
                {b.status === "payment_failed" ? (
                  <div className="mt-3 rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">
                    <div>{paymentFailureReason(b.failure_reason)}</div>
                    {holdExpired(b) ? (
                      <div className="mt-1 text-textSecondary">
                        This hold expired. Start a new booking.
                      </div>
                    ) : (
                      <div className="mt-1 text-textSecondary">
                        {holdDeadlineLine(b.payment_hold_expires_at)
                          ? `This booking is held until ${holdDeadlineLine(b.payment_hold_expires_at)}. `
                          : ""}
                        {b.instant_booking
                          ? "Update your card to retry this booking."
                          : `Update your card, then ${retryOwnerName(b)} can retry the charge.`}
                      </div>
                    )}
                    {b.space_public_id && !holdExpired(b) ? (
                      <Button
                        size="sm"
                        className="mt-3"
                        onClick={() => setPaymentUpdateRequest(b)}
                        disabled={updatingPayment}
                      >
                        {b.instant_booking ? "Update card and retry" : "Update card"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>
      <PaymentMethodModal
        open={Boolean(paymentUpdateRequest?.space_public_id)}
        spacePublicId={paymentUpdateRequest?.space_public_id || ""}
        organizationName={paymentUpdateRequest?.organization_name || null}
        initialMode="add"
        onClose={() => setPaymentUpdateRequest(null)}
        onSaved={handlePaymentMethodSaved}
      />
    </main>
  );
}
