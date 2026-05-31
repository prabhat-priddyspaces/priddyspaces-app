"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, Download, ReceiptText } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { downloadInvoicePdf } from "@/lib/invoice-download";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Invoice {
  public_id: string;
  amount: number;
  status: string;
  booking_id: number | null;
  booking_public_id: string | null;
  booking_start_datetime: string | null;
  booking_end_datetime: string | null;
  payment_id: number | null;
  payment_public_id: string | null;
  payment_provider: string | null;
  payment_status: string | null;
  subscription_public_id: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  space_public_id: string | null;
  space_name: string | null;
  space_type: string | null;
  location_name: string | null;
  location_city: string | null;
  description: string | null;
  pdf_url: string | null;
  created_at: string | null;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

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

function invoiceTitle(invoice: Invoice): string {
  return invoice.space_name || invoice.description || "Invoice";
}

function invoiceSubtitle(invoice: Invoice): string {
  const location = [invoice.location_name, invoice.location_city].filter(Boolean).join(" · ");
  const type = titleize(invoice.space_type);
  return [location, type].filter(Boolean).join(" · ") || invoice.public_id;
}

function invoiceWhen(invoice: Invoice): string {
  if (invoice.booking_start_datetime && invoice.booking_end_datetime) {
    return `${formatDateTime(invoice.booking_start_datetime)} - ${formatDateTime(invoice.booking_end_datetime)}`;
  }
  if (invoice.subscription_start_date) {
    const end = invoice.subscription_end_date ? ` - ${formatDate(invoice.subscription_end_date)}` : "";
    return `Membership period: ${formatDate(invoice.subscription_start_date)}${end}`;
  }
  return `Issued: ${formatDateTime(invoice.created_at)}`;
}

function statusVariant(status: string): "success" | "warning" | "danger" | "default" {
  if (status === "paid" || status === "issued" || status === "succeeded") return "success";
  if (status === "payment_failed" || status === "failed") return "danger";
  if (status === "open" || status === "pending") return "warning";
  return "default";
}

export default function MemberInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<Invoice[]>("/api/invoices", { method: "GET" }, token)
      .then(setInvoices)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load invoices"))
      .finally(() => setLoading(false));
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
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-textPrimary">Invoices</h1>
            <p className="mt-1 text-textSecondary">Your booking receipts and membership invoices.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/member/payments">
              <Button variant="secondary">Payments</Button>
            </Link>
            <Link href="/member">
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
          {loading ? (
            <div className="text-sm text-textMuted">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="text-sm text-textMuted">No booking receipts or membership invoices yet.</div>
          ) : (
            <div className="grid gap-3">
              {invoices.map((invoice) => (
                <div key={invoice.public_id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <ReceiptText size={16} className="text-accent" />
                        <div className="text-sm font-semibold text-textPrimary">{invoiceTitle(invoice)}</div>
                        <Badge variant={statusVariant(invoice.status)} dot>
                          {invoice.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-textMuted">{invoice.public_id}</div>
                      <div className="mt-3 grid gap-1.5 text-sm text-textSecondary">
                        <div className="flex items-start gap-2">
                          <Building2 size={14} className="mt-0.5 flex-none text-textMuted" />
                          <span>{invoiceSubtitle(invoice)}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <CalendarDays size={14} className="mt-0.5 flex-none text-textMuted" />
                          <span>{invoiceWhen(invoice)}</span>
                        </div>
                        {invoice.payment_public_id ? (
                          <div>
                            Payment {invoice.payment_public_id}
                            {invoice.payment_provider ? ` via ${invoice.payment_provider}` : ""}
                            {invoice.payment_status ? `, ${invoice.payment_status}` : ""}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <div className="font-mono text-lg font-semibold text-textPrimary">
                        {currency.format(invoice.amount)}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleDownload(invoice.public_id)}
                        disabled={downloading === invoice.public_id}
                      >
                        <Download size={14} />
                        {downloading === invoice.public_id ? "Preparing invoice..." : "Download invoice PDF"}
                      </Button>
                      {invoice.status === "payment_failed" ? (
                        <Link href="/member/subscriptions">
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
