"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PaymentSummary {
  status: string | null;
  amount: number | null;
  currency: string | null;
  attempt_number: number | null;
  failure_reason: string | null;
  attempted_at: string | null;
}

interface BookingRequest {
  public_id: string;
  space_public_id: string | null;
  booking_id: number | null;
  booking_public_id: string | null;
  start_datetime: string;
  end_datetime: string;
  status: string;
  payment_status: string | null;
  payment_provider: string | null;
  cancellation_deadline_at: string | null;
  cancelled_at: string | null;
  approved_at: string | null;
  operator_notes: string | null;
  estimated_amount: number | null;
  payment_attempt_count: number | null;
  failure_reason: string | null;
  last_payment: PaymentSummary | null;
}

interface Payment {
  id: number;
  public_id: string;
  amount: number;
  status: string;
  booking_id: number | null;
  subscription_id: number | null;
  created_at: string;
}

interface Invoice {
  public_id: string;
  amount: number;
  status: string;
  booking_id: number | null;
  payment_id: number | null;
  pdf_url: string | null;
  created_at: string;
}

export default function BookingDetailClient({ bookingId }: { bookingId: string }) {
  const [booking, setBooking] = useState<BookingRequest | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  async function load() {
    if (!bookingId) return;
    const token = getAccessToken() ?? undefined;
    const [bookingResp, paymentsResp, invoicesResp] = await Promise.all([
      apiFetch<BookingRequest>(`/api/booking-requests/${bookingId}`, { method: "GET" }, token),
      apiFetch<Payment[]>("/api/payments", { method: "GET" }, token).catch(() => []),
      apiFetch<Invoice[]>("/api/invoices", { method: "GET" }, token).catch(() => []),
    ]);
    setBooking(bookingResp);
    setPayments(paymentsResp);
    setInvoices(invoicesResp);
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load booking"))
      .finally(() => setLoading(false));
  }, [bookingId]);

  const relatedPayment = useMemo(() => {
    if (!booking?.booking_id) return null;
    return payments.find((payment) => payment.booking_id === booking.booking_id) || null;
  }, [booking, payments]);

  const relatedInvoice = useMemo(() => {
    if (!booking?.booking_id) return null;
    return (
      invoices.find((invoice) => invoice.booking_id === booking.booking_id) ||
      (relatedPayment ? invoices.find((invoice) => invoice.payment_id === relatedPayment.id) || null : null)
    );
  }, [booking, invoices, relatedPayment]);

  const canCancel =
    booking != null &&
    (booking.status === "requested" ||
      booking.status === "payment_failed" ||
      (booking.status === "approved" &&
        booking.cancellation_deadline_at != null &&
        new Date() <= new Date(booking.cancellation_deadline_at)));

  const deadlineCountdown = useMemo(() => {
    if (!booking?.cancellation_deadline_at) return null;
    const deadline = new Date(booking.cancellation_deadline_at).getTime();
    const now = Date.now();
    const ms = deadline - now;
    if (ms <= 0) return "Deadline passed";
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days === 1 ? "" : "s"} ${hours % 24}h left`;
    }
    return `${hours}h ${minutes}m left`;
  }, [booking]);

  async function cancelRequest() {
    const token = getAccessToken() ?? undefined;
    if (!token || !booking) return;
    setCancelling(true);
    setError("");
    try {
      await apiFetch(`/api/booking-requests/${booking.public_id}/cancel`, { method: "POST" }, token);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to cancel request");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/customer/requests" className="text-sm text-accent hover:underline">
          Back to requests
        </Link>
        {loading ? (
          <div className="mt-6 text-sm text-textMuted">Loading...</div>
        ) : error ? (
          <div className="mt-6 text-sm text-error">{error}</div>
        ) : booking ? (
          <div className="mt-6 grid gap-4">
            <Card className="p-6">
              <div className="text-lg font-semibold text-textPrimary">Request details</div>
              <div className="mt-3 text-sm text-textSecondary">
                Status: <span className="capitalize">{booking.status}</span>
              </div>
              <div className="mt-2 text-sm text-textSecondary">
                Payment: <span className="capitalize">{booking.payment_status || "not charged"}</span>
                {booking.payment_provider ? ` • ${booking.payment_provider}` : ""}
              </div>
              <div className="mt-2 text-sm text-textSecondary">
                Start: {new Date(booking.start_datetime).toLocaleString()}
              </div>
              <div className="mt-2 text-sm text-textSecondary">
                End: {new Date(booking.end_datetime).toLocaleString()}
              </div>
              {booking.estimated_amount != null ? (
                <div className="mt-2 text-sm text-textSecondary">
                  Estimated amount: ${booking.estimated_amount}
                </div>
              ) : null}
              {booking.operator_notes ? (
                <div className="mt-2 text-sm text-textSecondary">
                  Operator notes: {booking.operator_notes}
                </div>
              ) : null}
              {booking.cancellation_deadline_at ? (
                <div className="mt-2 text-sm text-textSecondary">
                  Cancel by {new Date(booking.cancellation_deadline_at).toLocaleString()}
                  {deadlineCountdown ? ` (${deadlineCountdown})` : ""}
                </div>
              ) : null}
              {booking.cancelled_at ? (
                <div className="mt-2 text-sm text-textSecondary">
                  Cancelled at {new Date(booking.cancelled_at).toLocaleString()}
                </div>
              ) : null}
              {booking.space_public_id ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/customer/spaces/${booking.space_public_id}`}>
                    <Button size="sm" variant="secondary">
                      View space
                    </Button>
                  </Link>
                  {canCancel ? (
                    <Button size="sm" variant="secondary" onClick={cancelRequest} disabled={cancelling}>
                      {cancelling ? "Cancelling..." : "Cancel request"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Card>

            <Card className="p-6">
              <div className="text-lg font-semibold text-textPrimary">Payment status</div>
              {booking.last_payment ? (
                <>
                  <div className="mt-3 text-sm text-textSecondary">
                    Status: <span className="capitalize">{booking.last_payment.status || "—"}</span>
                  </div>
                  {booking.last_payment.amount != null ? (
                    <div className="mt-2 text-sm text-textSecondary">
                      Amount: ${booking.last_payment.amount}
                    </div>
                  ) : null}
                  {booking.last_payment.attempt_number != null ? (
                    <div className="mt-2 text-sm text-textSecondary">
                      Attempt #{booking.last_payment.attempt_number}
                    </div>
                  ) : null}
                  {booking.last_payment.attempted_at ? (
                    <div className="mt-2 text-sm text-textSecondary">
                      Last attempt: {new Date(booking.last_payment.attempted_at).toLocaleString()}
                    </div>
                  ) : null}
                </>
              ) : relatedPayment ? (
                <>
                  <div className="mt-3 text-sm text-textSecondary">
                    Payment: {relatedPayment.public_id}
                  </div>
                  <div className="mt-2 text-sm text-textSecondary">
                    Status: <span className="capitalize">{relatedPayment.status}</span>
                  </div>
                  <div className="mt-2 text-sm text-textSecondary">
                    Amount: ${relatedPayment.amount}
                  </div>
                </>
              ) : (
                <div className="mt-3 text-sm text-textMuted">No payment has been recorded yet.</div>
              )}
              {booking.status === "payment_failed" ? (
                <div className="mt-4 rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">
                  <div className="font-medium">Payment failed</div>
                  {booking.failure_reason ? (
                    <div className="mt-1">{booking.failure_reason}</div>
                  ) : (
                    <div className="mt-1">
                      Your card could not be charged. Update your payment method and the owner can retry the charge.
                    </div>
                  )}
                  {booking.space_public_id ? (
                    <div className="mt-3">
                      <Link href={`/customer/spaces/${booking.space_public_id}`}>
                        <Button size="sm">Update payment method</Button>
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {(booking.last_payment?.status === "voided" || booking.last_payment?.status === "refunded") ? (
                <div className="mt-4 rounded-md border border-border bg-surface2 p-3 text-sm text-textSecondary">
                  Refund processed: <span className="capitalize">{booking.last_payment.status}</span>
                </div>
              ) : null}
            </Card>

            <Card className="p-6">
              <div className="text-lg font-semibold text-textPrimary">Invoice</div>
              {relatedInvoice ? (
                <>
                  <div className="mt-3 text-sm text-textSecondary">
                    Invoice: {relatedInvoice.public_id}
                  </div>
                  <div className="mt-2 text-sm text-textSecondary">
                    Status: <span className="capitalize">{relatedInvoice.status}</span>
                  </div>
                  <div className="mt-2 text-sm text-textSecondary">
                    Created: {new Date(relatedInvoice.created_at).toLocaleString()}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Link href="/customer/invoices">
                      <Button size="sm" variant="secondary">
                        View all invoices
                      </Button>
                    </Link>
                    {relatedInvoice.pdf_url ? (
                      <a href={relatedInvoice.pdf_url} target="_blank" rel="noreferrer">
                        <Button size="sm">Download PDF</Button>
                      </a>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="mt-3 text-sm text-textMuted">
                  An invoice will appear here after the booking payment succeeds.
                </div>
              )}
            </Card>
          </div>
        ) : null}
      </div>

    </main>
  );
}
