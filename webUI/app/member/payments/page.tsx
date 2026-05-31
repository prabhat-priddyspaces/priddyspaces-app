"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, CreditCard, Download } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { downloadInvoicePdf } from "@/lib/invoice-download";

interface Payment {
  id: number;
  public_id: string;
  amount: number;
  amount_cents: number | null;
  provider: string;
  status: string;
  booking_id: number | null;
  booking_public_id: string | null;
  booking_request_id: number | null;
  booking_request_public_id: string | null;
  booking_start_datetime: string | null;
  booking_end_datetime: string | null;
  subscription_id: number | null;
  subscription_public_id: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  space_public_id: string | null;
  space_name: string | null;
  space_type: string | null;
  location_name: string | null;
  location_city: string | null;
  organization_name: string | null;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  payment_method_exp_month: number | null;
  payment_method_exp_year: number | null;
  failure_reason: string | null;
  created_at: string | null;
}

interface Invoice {
  public_id: string;
  payment_id: number | null;
}

interface BookingPaymentMethod {
  public_id: string;
  organization_public_id: string | null;
  organization_name: string | null;
  provider: string;
  last4: string | null;
  brand: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default_for_owner: boolean;
  status: string;
  billing_name: string | null;
  created_at: string | null;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function paymentAmount(payment: Payment): number {
  if (payment.amount_cents != null) return payment.amount_cents / 100;
  return payment.amount || 0;
}

function formatDateTime(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function titleize(value: string | null): string | null {
  if (!value) return null;
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusVariant(status: string): "success" | "warning" | "danger" | "default" {
  if (status === "succeeded" || status === "refunded" || status === "voided") return "success";
  if (status === "failed" || status === "payment_failed") return "danger";
  if (status === "requires_payment" || status === "pending") return "warning";
  return "default";
}

function paymentTitle(payment: Payment): string {
  if (payment.booking_id != null || payment.booking_request_id != null) {
    return `Booking payment${payment.space_name ? ` · ${payment.space_name}` : ""}`;
  }
  if (payment.subscription_id != null) {
    return `Membership charge${payment.space_name ? ` · ${payment.space_name}` : ""}`;
  }
  return "Payment";
}

function paymentWhere(payment: Payment): string {
  const location = [payment.location_name, payment.location_city].filter(Boolean).join(" · ");
  const type = titleize(payment.space_type);
  return [location, type].filter(Boolean).join(" · ") || payment.organization_name || "Booking charge";
}

function paymentWhen(payment: Payment): string {
  if (payment.booking_start_datetime && payment.booking_end_datetime) {
    return `${formatDateTime(payment.booking_start_datetime)} - ${formatDateTime(payment.booking_end_datetime)}`;
  }
  if (payment.subscription_start_date) {
    const end = payment.subscription_end_date ? ` - ${formatDate(payment.subscription_end_date)}` : "";
    return `Membership period: ${formatDate(payment.subscription_start_date)}${end}`;
  }
  return `Charged: ${formatDateTime(payment.created_at)}`;
}

function cardLabel(brand: string | null, last4: string | null): string {
  const name = titleize(brand) || "Card";
  return last4 ? `${name} ending in ${last4}` : name;
}

function expiryLabel(month: number | null, year: number | null): string | null {
  if (month == null || year == null) return null;
  return `Expires ${String(month).padStart(2, "0")}/${year}`;
}

function failureReason(value: string | null): string {
  const text = (value || "").trim();
  if (!text || ["0", "failed", "payment failed"].includes(text.toLowerCase())) {
    return "The payment processor declined the charge. Update the card or contact the card issuer for details.";
  }
  return text;
}

export default function MemberPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bookingMethods, setBookingMethods] = useState<BookingPaymentMethod[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    Promise.all([
      apiFetch<Payment[]>("/api/payments", { method: "GET" }, token).catch(() => []),
      apiFetch<Invoice[]>("/api/invoices", { method: "GET" }, token).catch(() => []),
      apiFetch<BookingPaymentMethod[]>("/api/payment-methods", { method: "GET" }, token).catch(() => []),
    ])
      .then(([paymentsResp, invoicesResp, methodsResp]) => {
        setPayments(paymentsResp);
        setInvoices(invoicesResp);
        setBookingMethods(methodsResp);
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load payments"))
      .finally(() => setLoading(false));
  }, []);

  const invoiceByPaymentId = useMemo(() => {
    const map = new Map<number, Invoice>();
    invoices.forEach((invoice) => {
      if (invoice.payment_id != null) {
        map.set(invoice.payment_id, invoice);
      }
    });
    return map;
  }, [invoices]);

  const stats = useMemo(() => {
    const succeeded = payments.filter((payment) => payment.status === "succeeded");
    const failed = payments.filter((payment) => payment.status === "failed");
    return [
      { label: "Successful", value: succeeded.length.toString() },
      { label: "Failed", value: failed.length.toString() },
      {
        label: "Total Paid",
        value: currency.format(
          succeeded.reduce((sum, payment) => sum + paymentAmount(payment), 0)
        ),
      },
    ];
  }, [payments]);

  async function handleDownload(publicId: string) {
    const token = getAccessToken() ?? undefined;
    setDownloading(publicId);
    setMessage("");
    try {
      await downloadInvoicePdf(publicId, token);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to download invoice PDF");
    } finally {
      setDownloading(null);
    }
  }

  async function handleManageBilling() {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setBillingBusy(true);
    setMessage("");
    try {
      const session = await apiFetch<{ url: string }>("/api/payments/member-portal", { method: "POST" }, token);
      window.location.assign(session.url);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to open membership billing");
    } finally {
      setBillingBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-textPrimary">Payments</h1>
            <p className="mt-1 text-textSecondary">
              Review booking and membership charges, including failed attempts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/member/invoices">
              <Button variant="secondary">Invoices</Button>
            </Link>
            <Button variant="secondary" onClick={handleManageBilling} disabled={billingBusy}>
              {billingBusy ? "Opening..." : "Membership billing"}
            </Button>
          </div>
        </div>

        {message ? <div className="mt-4 text-sm text-textMuted">{message}</div> : null}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-4">
              <div className="text-sm text-textMuted">{stat.label}</div>
              <div className="mt-2 text-2xl font-semibold text-textPrimary">{stat.value}</div>
            </Card>
          ))}
        </div>

        <Card className="mt-6 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-textPrimary">Booking payment methods</h2>
              <p className="mt-1 text-sm text-textSecondary">
                Cards authorized for booking charges. Membership billing is managed from this page.
              </p>
            </div>
          </div>
          {loading ? (
            <div className="mt-4 text-sm text-textMuted">Loading payment methods...</div>
          ) : bookingMethods.length === 0 ? (
            <div className="mt-4 text-sm text-textMuted">No saved booking cards yet.</div>
          ) : (
            <div className="mt-4 grid gap-3">
              {bookingMethods.map((method) => (
                <div key={method.public_id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-textPrimary">
                        <CreditCard size={16} className="text-accent" />
                        {cardLabel(method.brand || method.provider, method.last4)}
                        {method.is_default_for_owner ? (
                          <Badge variant="success" dot>Default</Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-textMuted">
                        {method.organization_name || "Booking card"}
                      </div>
                      <div className="mt-2 text-sm text-textSecondary">
                        {expiryLabel(method.exp_month, method.exp_year) || "Expiration unavailable"}
                        {method.billing_name ? ` · ${method.billing_name}` : ""}
                      </div>
                    </div>
                    <Badge variant={method.status === "active" ? "success" : "default"} dot>
                      {method.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="mt-6 p-4">
          {loading ? (
            <div className="text-sm text-textMuted">Loading payments...</div>
          ) : payments.length === 0 ? (
            <div className="text-sm text-textMuted">No booking or membership payments yet.</div>
          ) : (
            <div className="grid gap-3">
              {payments.map((payment) => {
                const invoice = invoiceByPaymentId.get(payment.id);
                return (
                  <div key={payment.public_id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <CreditCard size={16} className="text-accent" />
                          <div className="text-sm font-semibold text-textPrimary">{paymentTitle(payment)}</div>
                          <Badge variant={statusVariant(payment.status)} dot>
                            {payment.status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <div className="mt-3 grid gap-1.5 text-sm text-textSecondary">
                          <div className="flex items-start gap-2">
                            <Building2 size={14} className="mt-0.5 flex-none text-textMuted" />
                            <span>{paymentWhere(payment)}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <CalendarDays size={14} className="mt-0.5 flex-none text-textMuted" />
                            <span>{paymentWhen(payment)}</span>
                          </div>
                          {invoice ? <div>Invoice {invoice.public_id}</div> : null}
                          {payment.payment_method_last4 ? (
                            <div>
                              {cardLabel(payment.payment_method_brand, payment.payment_method_last4)}
                              {expiryLabel(payment.payment_method_exp_month, payment.payment_method_exp_year)
                                ? ` · ${expiryLabel(payment.payment_method_exp_month, payment.payment_method_exp_year)}`
                                : ""}
                            </div>
                          ) : null}
                          {payment.failure_reason ? (
                            <div className="text-error">{failureReason(payment.failure_reason)}</div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        <div className="font-mono text-lg font-semibold text-textPrimary">
                          {currency.format(paymentAmount(payment))}
                        </div>
                        {invoice ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleDownload(invoice.public_id)}
                            disabled={downloading === invoice.public_id}
                          >
                            <Download size={14} />
                            {downloading === invoice.public_id ? "Preparing..." : "Download invoice"}
                          </Button>
                        ) : null}
                        {invoice ? (
                          <Link href="/member/invoices">
                            <Button size="sm" variant="secondary">
                              Open invoice record
                            </Button>
                          </Link>
                        ) : null}
                        {payment.status === "failed" && payment.subscription_id != null ? (
                          <Button size="sm" onClick={handleManageBilling} disabled={billingBusy}>
                            Fix billing
                          </Button>
                        ) : null}
                        {payment.status === "failed" && (payment.booking_id != null || payment.booking_request_id != null) ? (
                          <Link href={payment.booking_request_public_id ? `/member/requests/${payment.booking_request_public_id}` : "/member/requests"}>
                            <Button size="sm">Review booking request</Button>
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
