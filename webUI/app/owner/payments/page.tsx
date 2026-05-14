"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, CreditCard, Download, UserRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  member_name: string | null;
  member_email: string | null;
  booking_id: number | null;
  booking_public_id: string | null;
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
  failure_reason: string | null;
  commission_rate_pct: number | null;
  platform_fee_amount: number | null;
  owner_net_amount: number | null;
  created_at: string | null;
}

interface Invoice {
  public_id: string;
  payment_id: number | null;
}

interface Organization {
  public_id: string;
  name: string;
}

interface PayoutSummary {
  gross_cents: number;
  tax_cents: number;
  refunded_cents: number;
  platform_fee_cents: number;
  owner_net_cents: number;
  succeeded_count: number;
  failed_count: number;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const currencyFromCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
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
  if (payment.booking_id != null) return `Booking payment · ${payment.space_name || "Space"}`;
  if (payment.subscription_id != null) return `Membership charge · ${payment.space_name || "Space"}`;
  return "Payment";
}

function paymentWhere(payment: Payment): string {
  const location = [payment.location_name, payment.location_city].filter(Boolean).join(" · ");
  const type = titleize(payment.space_type);
  return [location, type].filter(Boolean).join(" · ") || payment.public_id;
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

function memberLabel(payment: Payment): string {
  return payment.member_name || payment.member_email || "Member unavailable";
}

export default function OwnerPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState("");
  const [payoutSummary, setPayoutSummary] = useState<PayoutSummary | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    Promise.all([
      apiFetch<Payment[]>("/api/payments", { method: "GET" }, token).catch(() => []),
      apiFetch<Invoice[]>("/api/invoices", { method: "GET" }, token).catch(() => []),
      apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token).catch(() => []),
    ])
      .then(([paymentsResp, invoicesResp, orgsResp]) => {
        setPayments(paymentsResp);
        setInvoices(invoicesResp);
        setOrgs(orgsResp);
        setOrgId((current) => current || orgsResp[0]?.public_id || "");
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load payments"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId) {
      setPayoutSummary(null);
      return;
    }
    const token = getAccessToken() ?? undefined;
    apiFetch<PayoutSummary>(
      `/api/owner/payout-summary?organization_public_id=${encodeURIComponent(orgId)}`,
      { method: "GET" },
      token,
    )
      .then(setPayoutSummary)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load payout summary"));
  }, [orgId]);

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
      { label: "Succeeded", value: succeeded.length.toString() },
      { label: "Failed", value: failed.length.toString() },
      {
        label: "Requires payment",
        value: payments.filter((payment) => payment.status === "requires_payment").length.toString(),
      },
      {
        label: "Processed volume",
        value: currency.format(succeeded.reduce((sum, payment) => sum + paymentAmount(payment), 0)),
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

  return (
    <AppShell>
      <div className="grid gap-6">
        <div>
          <h2 className="text-2xl font-semibold text-textPrimary">Payments</h2>
          <p className="text-textSecondary">
            Track booking and membership charges with member, space, invoice, and payout context.
          </p>
        </div>
        {orgs.length > 1 ? (
          <div className="max-w-sm">
            <select
              value={orgId}
              onChange={(event) => setOrgId(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
            >
              {orgs.map((org) => (
                <option key={org.public_id} value={org.public_id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {message ? <div className="text-sm text-textMuted">{message}</div> : null}

        <div className="grid gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-4">
              <div className="text-sm text-textMuted">{stat.label}</div>
              <div className="mt-2 text-2xl font-semibold text-textPrimary">{stat.value}</div>
            </Card>
          ))}
        </div>

        <Card className="grid gap-3 p-4">
          <div>
            <div className="text-sm font-semibold text-textPrimary">Payout ledger summary</div>
            <div className="text-xs text-textMuted">Internal payment ledger, net of recorded refunds.</div>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            {[
              ["Gross", payoutSummary?.gross_cents ?? 0],
              ["Tax", payoutSummary?.tax_cents ?? 0],
              ["Refunded", payoutSummary?.refunded_cents ?? 0],
              ["Platform fees", payoutSummary?.platform_fee_cents ?? 0],
              ["Owner net", payoutSummary?.owner_net_cents ?? 0],
            ].map(([label, cents]) => (
              <div key={label} className="rounded-md border border-border bg-surface2 p-3">
                <div className="text-xs text-textMuted">{label}</div>
                <div className="mt-1 text-lg font-semibold text-textPrimary">
                  {currencyFromCents.format(Number(cents) / 100)}
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs text-textMuted">
            Successful ledger entries: {payoutSummary?.succeeded_count ?? 0} · Failed entries: {payoutSummary?.failed_count ?? 0}
          </div>
        </Card>

        <Card className="p-4">
          {loading ? (
            <div className="text-sm text-textMuted">Loading payments...</div>
          ) : payments.length === 0 ? (
            <div className="text-sm text-textMuted">No payments yet.</div>
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
                        <div className="mt-1 text-xs text-textMuted">
                          {payment.public_id} · {payment.provider}
                        </div>
                        <div className="mt-3 grid gap-1.5 text-sm text-textSecondary">
                          <div className="flex items-start gap-2">
                            <UserRound size={14} className="mt-0.5 flex-none text-textMuted" />
                            <span>
                              {memberLabel(payment)}
                              {payment.member_name && payment.member_email ? ` · ${payment.member_email}` : ""}
                            </span>
                          </div>
                          <div className="flex items-start gap-2">
                            <Building2 size={14} className="mt-0.5 flex-none text-textMuted" />
                            <span>{paymentWhere(payment)}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <CalendarDays size={14} className="mt-0.5 flex-none text-textMuted" />
                            <span>{paymentWhen(payment)}</span>
                          </div>
                          {invoice ? <div>Invoice {invoice.public_id}</div> : null}
                          {payment.failure_reason ? (
                            <div className="text-danger">{payment.failure_reason}</div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        <div className="font-mono text-lg font-semibold text-textPrimary">
                          {currency.format(paymentAmount(payment))}
                        </div>
                        <div className="text-right text-xs text-textMuted">
                          Fee {currency.format(payment.platform_fee_amount ?? 0)}
                          <br />
                          Net {currency.format(payment.owner_net_amount ?? 0)}
                          {payment.commission_rate_pct != null ? ` · ${payment.commission_rate_pct}%` : ""}
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
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
                            <Link href="/owner/invoices">
                              <Button size="sm" variant="secondary">
                                View invoice
                              </Button>
                            </Link>
                          ) : null}
                          {payment.status === "failed" && payment.booking_id != null ? (
                            <Link href="/owner/requests">
                              <Button size="sm">Review follow-up</Button>
                            </Link>
                          ) : null}
                          {payment.status === "failed" && payment.subscription_id != null ? (
                            <Link href="/owner/settings">
                              <Button size="sm">Review billing setup</Button>
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
