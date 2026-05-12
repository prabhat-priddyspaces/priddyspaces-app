"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface Payment {
  id: number;
  public_id: string;
  amount: number;
  status: string;
  provider: string;
  booking_id: number | null;
  subscription_id: number | null;
  created_at: string;
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

export default function OwnerPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState("");
  const [payoutSummary, setPayoutSummary] = useState<PayoutSummary | null>(null);
  const [message, setMessage] = useState("");

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
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load payments"));
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
      { label: "Requires Payment", value: payments.filter((payment) => payment.status === "requires_payment").length.toString() },
      {
        label: "Processed Volume",
        value: currency.format(succeeded.reduce((sum, payment) => sum + (payment.amount || 0), 0)),
      },
    ];
  }, [payments]);

  return (
    <AppShell>
      <div className="grid gap-6">
        <div>
          <h2 className="text-2xl font-semibold">Payments</h2>
          <p className="text-textSecondary">
            Track booking and membership charges, including failed renewals from Stripe webhooks.
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
            Successful ledger entries: {payoutSummary?.succeeded_count ?? 0} • Failed entries: {payoutSummary?.failed_count ?? 0}
          </div>
        </Card>

        <Card className="p-4">
          {payments.length === 0 ? (
            <div className="text-sm text-textMuted">No payments yet.</div>
          ) : (
            <div className="grid gap-3">
              {payments.map((payment) => {
                const invoice = invoiceByPaymentId.get(payment.id);
                return (
                  <div key={payment.public_id} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-textPrimary">{payment.public_id}</div>
                        <div className="mt-1 text-xs text-textMuted">
                          {currency.format(payment.amount)} • {payment.status} • {payment.provider}
                        </div>
                        <div className="mt-1 text-xs text-textMuted">
                          {payment.subscription_id != null
                            ? "Membership charge"
                            : payment.booking_id != null
                              ? "Booking payment"
                              : "General payment"}
                          {" • "}
                          {new Date(payment.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
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
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
