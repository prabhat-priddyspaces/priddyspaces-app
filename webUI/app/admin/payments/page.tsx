"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, CreditCard, UserRound } from "lucide-react";

import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface AdminPayment {
  public_id: string;
  status: string;
  amount: number;
  amount_cents: number | null;
  currency: string | null;
  provider: string | null;
  provider_payment_id: string | null;
  failure_reason: string | null;
  commission_rate_pct: number | null;
  platform_fee_amount: number | null;
  owner_net_amount: number | null;
  member_name: string | null;
  member_email: string | null;
  organization_name: string | null;
  booking_public_id: string | null;
  booking_start_datetime: string | null;
  booking_end_datetime: string | null;
  subscription_public_id: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  space_name: string | null;
  space_type: string | null;
  location_name: string | null;
  location_city: string | null;
  created_at: string | null;
}

interface PaymentsResponse {
  summary: {
    gmv: number;
    platform_earnings: number;
    owner_net: number;
    failed_payments: number;
  };
  results: AdminPayment[];
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function paymentAmount(payment: AdminPayment): number {
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

function paymentTitle(payment: AdminPayment): string {
  if (payment.booking_public_id) return `Booking payment · ${payment.space_name || "Space"}`;
  if (payment.subscription_public_id) return `Membership charge · ${payment.space_name || "Space"}`;
  return payment.space_name ? `Payment · ${payment.space_name}` : "Payment";
}

function paymentWhere(payment: AdminPayment): string {
  const location = [payment.location_name, payment.location_city].filter(Boolean).join(" · ");
  const type = titleize(payment.space_type);
  return [location, type].filter(Boolean).join(" · ") || payment.organization_name || payment.public_id;
}

function paymentWhen(payment: AdminPayment): string {
  if (payment.booking_start_datetime && payment.booking_end_datetime) {
    return `${formatDateTime(payment.booking_start_datetime)} - ${formatDateTime(payment.booking_end_datetime)}`;
  }
  if (payment.subscription_start_date) {
    const end = payment.subscription_end_date ? ` - ${formatDate(payment.subscription_end_date)}` : "";
    return `Membership period: ${formatDate(payment.subscription_start_date)}${end}`;
  }
  return `Created: ${formatDateTime(payment.created_at)}`;
}

function memberLabel(payment: AdminPayment): string {
  return payment.member_name || payment.member_email || "Member unavailable";
}

export default function AdminPaymentsPage() {
  const [data, setData] = useState<PaymentsResponse | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<PaymentsResponse>("/api/admin/payments", { method: "GET" }, token)
      .then(setData)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load payments"));
  }, []);

  const stats = useMemo(() => {
    if (!data) return [];
    return [
      ["GMV", currency.format(data.summary.gmv)],
      ["Platform earnings", currency.format(data.summary.platform_earnings)],
      ["Owner net", currency.format(data.summary.owner_net)],
      ["Failed payments", data.summary.failed_payments.toString()],
    ];
  }, [data]);

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Payments & Earnings</h2>
          <p className="text-text-2">
            Platform GMV, owner net, commission, member, organization, and space-level payment context.
          </p>
        </div>
        {message ? <div className="text-sm text-danger">{message}</div> : null}
        {data ? (
          <div className="grid gap-4 md:grid-cols-4">
            {stats.map(([label, value]) => (
              <Card key={label} className="p-4">
                <div className="text-sm text-text-3">{label}</div>
                <div className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">{value}</div>
              </Card>
            ))}
          </div>
        ) : null}
        <div className="grid gap-3">
          {data?.results.map((payment) => (
            <Card key={payment.public_id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CreditCard size={16} className="text-accent" />
                    <div className="font-semibold text-text">{paymentTitle(payment)}</div>
                    <Badge variant={statusVariant(payment.status)} dot>
                      {payment.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-text-3">
                    {payment.public_id}
                    {payment.provider ? ` · ${payment.provider}` : ""}
                    {payment.provider_payment_id ? ` · ${payment.provider_payment_id}` : ""}
                  </div>
                  <div className="mt-3 grid gap-1.5 text-sm text-text-2">
                    <div className="flex items-start gap-2">
                      <UserRound size={14} className="mt-0.5 flex-none text-text-3" />
                      <span>
                        {memberLabel(payment)}
                        {payment.member_name && payment.member_email ? ` · ${payment.member_email}` : ""}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Building2 size={14} className="mt-0.5 flex-none text-text-3" />
                      <span>
                        {payment.organization_name || "No organization"} · {paymentWhere(payment)}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CalendarDays size={14} className="mt-0.5 flex-none text-text-3" />
                      <span>{paymentWhen(payment)}</span>
                    </div>
                    {payment.booking_public_id ? <div>Booking {payment.booking_public_id}</div> : null}
                    {payment.subscription_public_id ? <div>Subscription {payment.subscription_public_id}</div> : null}
                    {payment.failure_reason ? <div className="text-danger">{payment.failure_reason}</div> : null}
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <div className="font-mono text-lg font-semibold text-text">
                    {currency.format(paymentAmount(payment))}
                  </div>
                  <div className="mt-2 text-xs text-text-3">
                    Fee {currency.format(payment.platform_fee_amount ?? 0)}
                    <br />
                    Owner net {currency.format(payment.owner_net_amount ?? 0)}
                    {payment.commission_rate_pct != null ? (
                      <>
                        <br />
                        Commission {payment.commission_rate_pct}%
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {data?.results.length === 0 ? <Card className="p-4 text-sm text-text-3">No payments found.</Card> : null}
        </div>
      </div>
    </AdminShell>
  );
}
