"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface Payment {
  id: number;
  public_id: string;
  amount: number;
  provider: string;
  status: string;
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

export default function CustomerPaymentsPage() {
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
      { label: "Successful", value: succeeded.length.toString() },
      { label: "Failed", value: failed.length.toString() },
      {
        label: "Total Paid",
        value: currency.format(
          succeeded.reduce((sum, payment) => sum + (payment.amount || 0), 0)
        ),
      },
    ];
  }, [payments]);

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-textPrimary">Payments</h1>
            <p className="mt-1 text-textSecondary">
              Review booking and membership charges, including failed attempts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/customer/invoices">
              <Button variant="secondary">Invoices</Button>
            </Link>
            <Link href="/customer">
              <Button variant="secondary">Marketplace</Button>
            </Link>
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
                          <Link href="/customer/invoices">
                            <Button size="sm" variant="secondary">
                              View invoice
                            </Button>
                          </Link>
                        ) : null}
                        {payment.status === "failed" && payment.subscription_id != null ? (
                          <Link href="/customer/subscriptions">
                            <Button size="sm">Fix billing</Button>
                          </Link>
                        ) : null}
                        {payment.status === "failed" && payment.booking_id != null ? (
                          <Link href="/customer/requests">
                            <Button size="sm">View requests</Button>
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
