"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface PaymentsResponse {
  summary: {
    gmv: number;
    platform_earnings: number;
    owner_net: number;
    failed_payments: number;
  };
  results: Array<{
    public_id: string;
    status: string;
    amount: number;
    commission_rate_pct: number | null;
    platform_fee_amount: number | null;
    owner_net_amount: number | null;
    customer_email: string | null;
    organization_name: string | null;
    created_at: string | null;
  }>;
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

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-textPrimary">Payments & Earnings</h2>
          <p className="text-textSecondary">Platform GMV, commission earned, and owner net snapshot totals.</p>
        </div>
        {message ? <div className="text-sm text-error">{message}</div> : null}
        {data ? (
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ["GMV", data.summary.gmv],
              ["Platform Earnings", data.summary.platform_earnings],
              ["Owner Net", data.summary.owner_net],
              ["Failed Payments", data.summary.failed_payments],
            ].map(([label, value]) => (
              <Card key={label} className="p-4">
                <div className="text-sm text-textMuted">{label}</div>
                <div className="mt-2 text-2xl font-semibold">{value}</div>
              </Card>
            ))}
          </div>
        ) : null}
        <div className="grid gap-3">
          {data?.results.map((payment) => (
            <Card key={payment.public_id} className="p-4">
              <div className="font-semibold text-textPrimary">{payment.public_id}</div>
              <div className="text-sm text-textMuted">
                {payment.organization_name || "No org"} • {payment.customer_email}
              </div>
              <div className="text-sm text-textMuted">
                {payment.status} • Amount {payment.amount} • Fee {payment.platform_fee_amount ?? 0} • Net {payment.owner_net_amount ?? 0}
              </div>
            </Card>
          ))}
          {data?.results.length === 0 ? <Card className="p-4 text-sm text-textMuted">No payments found.</Card> : null}
        </div>
      </div>
    </AdminShell>
  );
}
