"use client";

import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

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

export default function OwnerInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<Invoice[]>("/api/invoices", { method: "GET" }, token)
      .then(setInvoices)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load invoices"));
  }, []);

  const stats = useMemo(() => {
    return [
      { label: "Invoices", value: invoices.length.toString() },
      {
        label: "Booking",
        value: invoices.filter((invoice) => invoice.booking_id != null).length.toString(),
      },
      {
        label: "Membership",
        value: invoices.filter((invoice) => invoice.booking_id == null).length.toString(),
      },
      {
        label: "Failed",
        value: invoices.filter((invoice) => invoice.status === "payment_failed").length.toString(),
      },
    ];
  }, [invoices]);

  return (
    <AppShell>
      <div className="grid gap-6">
        <div>
          <h2 className="text-2xl font-semibold">Invoices</h2>
          <p className="text-textSecondary">
            Booking receipts and subscription invoices generated from successful or failed billing events.
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
                    {invoice.pdf_url ? (
                      <a href={invoice.pdf_url} target="_blank" rel="noreferrer">
                        <Button size="sm">Download PDF</Button>
                      </a>
                    ) : (
                      <Button size="sm" variant="secondary" disabled>
                        PDF pending
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
