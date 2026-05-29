"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { downloadInvoicePdf } from "@/lib/invoice-download";
import { formatUsd, type MoneyValue } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PaymentMethodModal } from "@/components/payment-method-modal";

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
  created_at: string | null;
  space_public_id: string | null;
  space_name: string | null;
  space_type: string | null;
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
  booking_id: number | null;
  booking_public_id: string | null;
  start_datetime: string;
  end_datetime: string;
  status: string;
  payment_status: string | null;
  payment_provider: string | null;
  instant_booking: boolean;
  cancellation_deadline_at: string | null;
  cancelled_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  operator_notes: string | null;
  estimated_amount: MoneyValue | null;
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
  created_at: string | null;
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

function formatAddress(booking: BookingRequest) {
  const locality = [booking.location_city, booking.location_state, booking.location_postal_code]
    .filter(Boolean)
    .join(", ");
  return [booking.location_address, locality].filter(Boolean).join(" ");
}

function decisionLine(booking: BookingRequest) {
  if (booking.status === "approved" && booking.approved_at) {
    return `Approved at ${formatDateTime(booking.approved_at)}`;
  }
  if (booking.status === "rejected" && booking.rejected_at) {
    return `Rejected at ${formatDateTime(booking.rejected_at)}`;
  }
  if (booking.status === "cancelled" && booking.cancelled_at) {
    return `Cancelled at ${formatDateTime(booking.cancelled_at)}`;
  }
  return null;
}

export default function BookingDetailClient({ bookingId }: { bookingId: string }) {
  const searchParams = useSearchParams();
  const isLegacyPlaceholder =
    !bookingId || bookingId === "_" || bookingId === "_.html";
  const effectiveBookingId =
    isLegacyPlaceholder ? searchParams.get("id") || "" : bookingId;
  const [booking, setBooking] = useState<BookingRequest | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [paymentMethodOpen, setPaymentMethodOpen] = useState(false);
  const [updatingPayment, setUpdatingPayment] = useState(false);

  const load = useCallback(async () => {
    if (!effectiveBookingId) {
      throw new Error("Booking request not found");
    }
    const token = getAccessToken() ?? undefined;
    const [bookingResp, paymentsResp, invoicesResp] = await Promise.all([
      apiFetch<BookingRequest>(`/api/booking-requests/${effectiveBookingId}`, { method: "GET" }, token),
      apiFetch<Payment[]>("/api/payments", { method: "GET" }, token).catch(() => []),
      apiFetch<Invoice[]>("/api/invoices", { method: "GET" }, token).catch(() => []),
    ]);
    setBooking(bookingResp);
    setPayments(paymentsResp);
    setInvoices(invoicesResp);
  }, [effectiveBookingId]);

  useEffect(() => {
    setError("");
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load booking"))
      .finally(() => setLoading(false));
  }, [load]);

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

  async function handleInvoiceDownload(publicId: string) {
    const token = getAccessToken() ?? undefined;
    setDownloadingInvoice(true);
    setError("");
    try {
      await downloadInvoicePdf(publicId, token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to download invoice PDF");
    } finally {
      setDownloadingInvoice(false);
    }
  }

  async function handlePaymentMethodSaved(paymentMethodPublicId: string) {
    if (!booking) return;
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setUpdatingPayment(true);
    setError("");
    try {
      await apiFetch(
        `/api/booking-requests/${booking.public_id}/payment-method`,
        {
          method: "POST",
          body: JSON.stringify({
            member_owner_payment_method_public_id: paymentMethodPublicId,
            payment_authorization_consent: true,
          }),
        },
        token,
      );
      if (booking.instant_booking) {
        await apiFetch(
          `/api/booking-requests/${booking.public_id}/retry-payment`,
          { method: "POST", body: JSON.stringify({ operator_notes: null }) },
          token,
        );
      }
      setPaymentMethodOpen(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to update payment method");
    } finally {
      setUpdatingPayment(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/member/requests" className="text-sm text-accent hover:underline">
          Back to requests
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-textPrimary">Request details</h1>
        {loading ? (
          <div className="mt-6 text-sm text-textMuted">Loading...</div>
        ) : error ? (
          <div className="mt-6 text-sm text-error">{error}</div>
        ) : booking ? (
          <div className="mt-6 grid gap-4">
            <Card className="p-6">
              <div className="text-lg font-semibold text-textPrimary">Space</div>
              <div className="mt-3 text-sm text-textSecondary">
                Name: {booking.space_name || formatSpaceType(booking.space_type)}
              </div>
              <div className="mt-2 text-sm text-textSecondary">
                Type: {formatSpaceType(booking.space_type)}
              </div>
              <div className="mt-2 text-sm text-textSecondary">
                Start: {formatDateTime(booking.start_datetime)}
              </div>
              <div className="mt-2 text-sm text-textSecondary">
                End: {formatDateTime(booking.end_datetime)}
              </div>
              {booking.estimated_amount != null ? (
                <div className="mt-2 text-sm text-textSecondary">
                  Estimated amount: {formatUsd(booking.estimated_amount)}
                </div>
              ) : null}
              {(booking.space_public_id || canCancel) ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {booking.space_public_id ? (
                    <Link href={`/member/spaces/${booking.space_public_id}`}>
                      <Button size="sm" variant="secondary">
                        View space
                      </Button>
                    </Link>
                  ) : null}
                  {canCancel ? (
                    <Button size="sm" variant="secondary" onClick={cancelRequest} disabled={cancelling}>
                      {cancelling ? "Cancelling..." : "Cancel request"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Card>

            <Card className="p-6">
              <div className="text-lg font-semibold text-textPrimary">Location</div>
              <div className="mt-3 text-sm text-textSecondary">
                Location: {booking.location_name || "Not available"}
              </div>
              {formatAddress(booking) ? (
                <div className="mt-2 text-sm text-textSecondary">
                  Address: {formatAddress(booking)}
                </div>
              ) : null}
              {booking.location_timezone ? (
                <div className="mt-2 text-sm text-textSecondary">
                  Timezone: {booking.location_timezone}
                </div>
              ) : null}
            </Card>

            <Card className="p-6">
              <div className="text-lg font-semibold text-textPrimary">Contact</div>
              {booking.support_contacts.length > 0 ? (
                <div className="mt-3 grid gap-2 text-sm text-textSecondary">
                  {booking.support_contacts.map((contact) => (
                    <div key={`${contact.name}-${contact.title}`}>
                      {contact.name} · {contact.title}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-sm text-textMuted">No public contact person listed.</div>
              )}
              {booking.location_public_phone ? (
                <div className="mt-2 text-sm text-textSecondary">
                  Phone: {booking.location_public_phone}
                </div>
              ) : null}
              {booking.location_public_email ? (
                <div className="mt-2 text-sm text-textSecondary">
                  Email: {booking.location_public_email}
                </div>
              ) : null}
            </Card>

            <Card className="p-6">
              <div className="text-lg font-semibold text-textPrimary">Timeline</div>
              <div className="mt-3 text-sm text-textSecondary">
                Status: <span className="capitalize">{formatStatus(booking.status)}</span>
              </div>
              <div className="mt-2 text-sm text-textSecondary">
                Request sent: {formatDateTime(booking.created_at)}
              </div>
              {decisionLine(booking) ? (
                <div className="mt-2 text-sm text-textSecondary">{decisionLine(booking)}</div>
              ) : null}
              {booking.cancellation_deadline_at ? (
                <div className="mt-2 text-sm text-textSecondary">
                  Cancel by {formatDateTime(booking.cancellation_deadline_at)}
                  {deadlineCountdown ? ` (${deadlineCountdown})` : ""}
                </div>
              ) : null}
              {booking.operator_notes ? (
                <div className="mt-2 text-sm text-textSecondary">
                  Operator notes: {booking.operator_notes}
                </div>
              ) : null}
            </Card>

            <Card className="p-6">
              <div className="text-lg font-semibold text-textPrimary">Payment status</div>
              {booking.last_payment ? (
                <>
                  <div className="mt-3 text-sm text-textSecondary">
                    Status: <span className="capitalize">{formatStatus(booking.last_payment.status || "—")}</span>
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
                      Last attempt: {formatDateTime(booking.last_payment.attempted_at)}
                    </div>
                  ) : null}
                </>
              ) : relatedPayment ? (
                <>
                  <div className="mt-3 text-sm text-textSecondary">
                    Payment: {relatedPayment.public_id}
                  </div>
                  <div className="mt-2 text-sm text-textSecondary">
                    Status: <span className="capitalize">{formatStatus(relatedPayment.status)}</span>
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
                      Your card could not be charged.
                    </div>
                  )}
                  <div className="mt-1 text-textSecondary">
                    {booking.instant_booking
                      ? "Update your card to retry this booking."
                      : "Update your card, then the owner can retry the charge."}
                  </div>
                  {booking.space_public_id ? (
                    <div className="mt-3">
                      <Button size="sm" onClick={() => setPaymentMethodOpen(true)} disabled={updatingPayment}>
                        {booking.instant_booking ? "Update card and retry" : "Update card"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {(booking.last_payment?.status === "voided" || booking.last_payment?.status === "refunded") ? (
                <div className="mt-4 rounded-md border border-border bg-surface2 p-3 text-sm text-textSecondary">
                  Refund processed: <span className="capitalize">{formatStatus(booking.last_payment.status)}</span>
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
                    Status: <span className="capitalize">{formatStatus(relatedInvoice.status)}</span>
                  </div>
                  <div className="mt-2 text-sm text-textSecondary">
                    Created: {formatDateTime(relatedInvoice.created_at)}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Link href="/member/invoices">
                      <Button size="sm" variant="secondary">
                        View all invoices
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      onClick={() => handleInvoiceDownload(relatedInvoice.public_id)}
                      disabled={downloadingInvoice}
                    >
                      <Download size={14} />
                      {downloadingInvoice ? "Preparing..." : "Download PDF"}
                    </Button>
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

      <PaymentMethodModal
        open={paymentMethodOpen && Boolean(booking?.space_public_id)}
        spacePublicId={booking?.space_public_id || ""}
        onClose={() => setPaymentMethodOpen(false)}
        onSaved={handlePaymentMethodSaved}
      />
    </main>
  );
}
