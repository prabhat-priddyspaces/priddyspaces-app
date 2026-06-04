"use client";

import { useMemo, useState } from "react";
import { Building2, CalendarDays, Download, ReceiptText, UserRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAccessToken } from "@/lib/auth";
import { downloadInvoicePdf } from "@/lib/invoice-download";
import { useResourceList } from "@/hooks/useResource";

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
  member_name: string | null;
  member_email: string | null;
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

function statusVariant(status: string): "success" | "warning" | "danger" | "default" {
  if (status === "paid" || status === "issued" || status === "succeeded") return "success";
  if (status === "payment_failed" || status === "failed") return "danger";
  if (status === "open" || status === "pending") return "warning";
  return "default";
}

function invoiceTitle(invoice: Invoice): string {
  if (invoice.booking_id != null) return `Booking receipt · ${invoice.space_name || "Space"}`;
  if (invoice.subscription_public_id) return `Membership invoice · ${invoice.space_name || "Space"}`;
  return invoice.description || invoice.space_name || "Invoice";
}

function invoiceWhere(invoice: Invoice): string {
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

function memberLabel(invoice: Invoice): string {
  return invoice.member_name || invoice.member_email || "Member unavailable";
}

export default function OwnerInvoicesPage() {
  const { items: invoices, error: loadError, loading } = useResourceList<Invoice>("/api/invoices");
  const [message, setMessage] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  const stats = useMemo(() => {
    const successful = invoices.filter((invoice) => invoice.status === "paid" || invoice.status === "issued");
    const failed = invoices.filter((invoice) => invoice.status === "payment_failed");
    return [
      { label: "Invoices", value: invoices.length.toString() },
      { label: "Booking receipts", value: invoices.filter((invoice) => invoice.booking_id != null).length.toString() },
      { label: "Membership invoices", value: invoices.filter((invoice) => invoice.booking_id == null).length.toString() },
      { label: "Collected", value: currency.format(successful.reduce((sum, invoice) => sum + (invoice.amount || 0), 0)) },
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
    <AppShell>
      <div className="grid gap-6">
        <div>
          <h2 className="text-2xl font-semibold text-textPrimary">Invoices</h2>
          <p className="text-textSecondary">
            Booking receipts and membership invoices with member, space, payment, and PDF details.
          </p>
        </div>
        {loadError || message ? (
          <div className="text-sm text-textMuted">{loadError || message}</div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-5">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-4">
              <div className="text-sm text-textMuted">{stat.label}</div>
              <div className="mt-2 text-2xl font-semibold text-textPrimary">{stat.value}</div>
            </Card>
          ))}
        </div>

        <Card className="p-4">
          {loading ? (
            <div className="text-sm text-textMuted">Loading owner invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="text-sm text-textMuted">No booking receipts or membership invoices have been issued yet.</div>
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
                          <UserRound size={14} className="mt-0.5 flex-none text-textMuted" />
                          <span>
                            {memberLabel(invoice)}
                            {invoice.member_name && invoice.member_email ? ` · ${invoice.member_email}` : ""}
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <Building2 size={14} className="mt-0.5 flex-none text-textMuted" />
                          <span>{invoiceWhere(invoice)}</span>
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
                        {currency.format(invoice.amount || 0)}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleDownload(invoice.public_id)}
                        disabled={downloading === invoice.public_id}
                      >
                        <Download size={14} />
                        {downloading === invoice.public_id ? "Preparing invoice..." : "Download invoice PDF"}
                      </Button>
                    </div>
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
