"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PaymentModal } from "@/components/payment-modal";

interface BookingRequest {
  public_id: string;
  space_public_id: string | null;
  booking_id: number | null;
  booking_public_id: string | null;
  start_datetime: string;
  end_datetime: string;
  status: string;
  operator_notes: string | null;
  estimated_amount: number | null;
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
  const [paying, setPaying] = useState(false);

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

  const canPayNow =
    booking?.status === "approved" &&
    booking.booking_public_id &&
    booking.estimated_amount != null &&
    (!relatedPayment || relatedPayment.status !== "succeeded");

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
              {booking.space_public_id ? (
                <div className="mt-4">
                  <Link href={`/customer/spaces/${booking.space_public_id}`}>
                    <Button size="sm" variant="secondary">
                      View space
                    </Button>
                  </Link>
                </div>
              ) : null}
            </Card>

            <Card className="p-6">
              <div className="text-lg font-semibold text-textPrimary">Payment status</div>
              {relatedPayment ? (
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
                  <div className="mt-2 text-sm text-textSecondary">
                    Updated: {new Date(relatedPayment.created_at).toLocaleString()}
                  </div>
                </>
              ) : (
                <div className="mt-3 text-sm text-textMuted">No payment has been recorded yet.</div>
              )}
              {canPayNow ? (
                <div className="mt-4">
                  <Button size="sm" onClick={() => setPaying(true)}>
                    Pay now
                  </Button>
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

      {paying && booking?.booking_public_id && booking.estimated_amount != null ? (
        <PaymentModal
          open={true}
          bookingPublicId={booking.booking_public_id}
          amount={booking.estimated_amount}
          onClose={() => setPaying(false)}
          onDone={() => {
            setPaying(false);
            load().catch(() => null);
          }}
        />
      ) : null}
    </main>
  );
}
