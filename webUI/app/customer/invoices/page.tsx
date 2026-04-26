"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Invoice {
  public_id: string;
  amount: number;
  status: string;
  booking_id: number | null;
  payment_id: number | null;
  pdf_url: string | null;
  created_at: string;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function CustomerInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<Invoice[]>("/api/invoices", { method: "GET" }, token)
      .then(setInvoices)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load invoices"));
  }, []);

  const stats = useMemo(() => {
    const paid = invoices.filter((invoice) => invoice.status === "paid" || invoice.status === "issued");
    const failed = invoices.filter((invoice) => invoice.status === "payment_failed");
    return [
      { label: "Invoices", value: invoices.length.toString() },
      { label: "Successful", value: paid.length.toString() },
      { label: "Failed", value: failed.length.toString() },
    ];
  }, [invoices]);

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-textPrimary">Invoices</h1>
            <p className="mt-1 text-textSecondary">Your booking receipts and membership invoices.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/customer/payments">
              <Button variant="secondary">Payments</Button>
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
          {invoices.length === 0 ? (
            <div className="text-sm text-textMuted">No invoices yet.</div>
          ) : (
            <div className="grid gap-3">
              {invoices.map((invoice) => (
                <div key={invoice.public_id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-textPrimary">{invoice.public_id}</div>
                      <div className="mt-1 text-xs text-textMuted">
                        {currency.format(invoice.amount)} • {invoice.status}
                      </div>
                      <div className="mt-1 text-xs text-textMuted">
                        {invoice.booking_id != null ? "Booking receipt" : "Membership invoice"}
                        {" • "}
                        {new Date(invoice.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {invoice.pdf_url ? (
                        <a href={invoice.pdf_url} target="_blank" rel="noreferrer">
                          <Button size="sm">Download PDF</Button>
                        </a>
                      ) : (
                        <Button size="sm" variant="secondary" disabled>
                          PDF pending
                        </Button>
                      )}
                      {invoice.status === "payment_failed" ? (
                        <Link href="/customer/subscriptions">
                          <Button size="sm" variant="secondary">
                            Fix billing
                          </Button>
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
