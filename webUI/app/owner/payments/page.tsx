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

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function OwnerPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    Promise.all([
      apiFetch<Payment[]>("/api/payments", { method: "GET" }, token).catch(() => []),
      apiFetch<Invoice[]>("/api/invoices", { method: "GET" }, token).catch(() => []),
    ])
      .then(([paymentsResp, invoicesResp]) => {
        setPayments(paymentsResp);
        setInvoices(invoicesResp);
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load payments"));
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
        {message ? <div className="text-sm text-textMuted">{message}</div> : null}

        <div className="grid gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-4">
              <div className="text-sm text-textMuted">{stat.label}</div>
              <div className="mt-2 text-2xl font-semibold text-textPrimary">{stat.value}</div>
            </Card>
          ))}
        </div>

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
