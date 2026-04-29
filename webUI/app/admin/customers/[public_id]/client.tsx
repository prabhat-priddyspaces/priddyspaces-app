"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { formatCents } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken, setAccessToken } from "@/lib/auth";
import { formatCurrency } from "@/lib/calendar";

interface OrgActivity {
  user_public_id: string;
  organization_public_id: string;
  name: string;
  email: string;
  status: string;
  stats: {
    total_bookings: number;
    confirmed_bookings: number;
    canceled_bookings: number;
    no_shows: number;
    open_requests: number;
    total_revenue_cents: number;
    active_subscriptions: number;
    first_booking_at: string | null;
    last_booking_at: string | null;
  };
}

interface CustomerDetail {
  profile: {
    public_id: string;
    email: string;
    name: string;
    role: string | null;
    is_active: boolean;
    email_verified: boolean;
    stripe_customer_id: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
  bookings: Array<{
    public_id: string;
    status: string;
    start_datetime: string;
    end_datetime: string;
    checked_in_at: string | null;
    checked_out_at: string | null;
    no_show: boolean;
    created_at: string | null;
  }>;
  payments: Array<{
    public_id: string;
    status: string;
    amount: number;
    stripe_payment_intent_id: string | null;
    created_at: string | null;
  }>;
  subscriptions: Array<{
    public_id: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    stripe_subscription_id: string | null;
  }>;
  audit_logs: Array<{
    public_id: string;
    action: string;
    entity_type: string;
    entity_public_id: string;
    actor_email: string | null;
    created_at: string | null;
  }>;
}

export function AdminCustomerDetailClient() {
  const params = useParams<{ public_id: string }>();
  const router = useRouter();
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [orgActivity, setOrgActivity] = useState<OrgActivity[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    try {
      const [result, orgs] = await Promise.all([
        apiFetch<CustomerDetail>(
          `/api/admin/customers/${params.public_id}`,
          { method: "GET" },
          token
        ),
        apiFetch<OrgActivity[]>(
          `/api/admin/customers/${params.public_id}/orgs`,
          { method: "GET" },
          token
        ).catch(() => [] as OrgActivity[]),
      ]);
      setData(result);
      setOrgActivity(orgs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer");
    }
  }, [params.public_id]);

  useEffect(() => {
    load();
  }, [load]);

  async function impersonate() {
    const token = getAccessToken() ?? undefined;
    try {
      const response = await apiFetch<{ access_token: string; default_route: string }>(
        "/api/admin/impersonation/start",
        {
          method: "POST",
          body: JSON.stringify({
            user_public_id: params.public_id,
            reason: "Customer support review",
          }),
        },
        token
      );
      setAccessToken(response.access_token);
      router.push(response.default_route);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <Link href="/admin/customers" className="text-xs text-accent hover:underline">
            ← Back to customers
          </Link>
        </div>
        {error ? <div className="text-sm text-error">{error}</div> : null}
        {data ? (
          <>
            <Card className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-textPrimary">{data.profile.name}</h2>
                  <div className="text-sm text-textSecondary">{data.profile.email}</div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-textMuted">
                    <span>Active: {data.profile.is_active ? "yes" : "no"}</span>
                    <span>Verified: {data.profile.email_verified ? "yes" : "no"}</span>
                    <span>Created: {data.profile.created_at?.slice(0, 10) ?? "—"}</span>
                    <span>Stripe: {data.profile.stripe_customer_id ?? "—"}</span>
                  </div>
                </div>
                <Button type="button" onClick={impersonate}>
                  Impersonate
                </Button>
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-textPrimary">
                  Cross-org activity ({orgActivity.length})
                </div>
                <div className="text-xs text-textMuted">
                  Per-org relationships and stats — useful for support across multiple owners.
                </div>
              </div>
              {orgActivity.length === 0 ? (
                <div className="text-xs text-textMuted">No org activity for this customer.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="text-left text-textMuted">
                      <tr>
                        <th className="p-2">Organization</th>
                        <th className="p-2">CRM status</th>
                        <th className="p-2 text-right">Bookings</th>
                        <th className="p-2 text-right">Revenue</th>
                        <th className="p-2 text-right">Active subs</th>
                        <th className="p-2">Last booking</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orgActivity.map((item) => (
                        <tr
                          key={item.organization_public_id}
                          className="border-t border-border"
                        >
                          <td className="p-2 text-textPrimary">{item.name}</td>
                          <td className="p-2 text-textSecondary capitalize">{item.status}</td>
                          <td className="p-2 text-right text-textPrimary">
                            <div>{item.stats.confirmed_bookings} confirmed</div>
                            <div className="text-textMuted">{item.stats.total_bookings} total</div>
                          </td>
                          <td className="p-2 text-right text-textPrimary">
                            {formatCurrency(item.stats.total_revenue_cents)}
                          </td>
                          <td className="p-2 text-right text-textPrimary">
                            {item.stats.active_subscriptions}
                          </td>
                          <td className="p-2 text-textMuted">
                            {item.stats.last_booking_at?.slice(0, 10) ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="mb-3 text-sm font-semibold text-textPrimary">Bookings ({data.bookings.length})</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-left text-textMuted">
                    <tr>
                      <th className="p-2">Status</th>
                      <th className="p-2">Start</th>
                      <th className="p-2">End</th>
                      <th className="p-2">Check-in</th>
                      <th className="p-2">Check-out</th>
                      <th className="p-2">No-show</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bookings.map((b) => (
                      <tr key={b.public_id} className="border-t border-border">
                        <td className="p-2 text-textPrimary">{b.status}</td>
                        <td className="p-2 text-textSecondary">{b.start_datetime.slice(0, 16).replace("T", " ")}</td>
                        <td className="p-2 text-textSecondary">{b.end_datetime.slice(0, 16).replace("T", " ")}</td>
                        <td className="p-2 text-textSecondary">{b.checked_in_at?.slice(0, 16).replace("T", " ") ?? "—"}</td>
                        <td className="p-2 text-textSecondary">{b.checked_out_at?.slice(0, 16).replace("T", " ") ?? "—"}</td>
                        <td className="p-2">
                          {b.no_show ? <span className="text-error">yes</span> : <span className="text-textMuted">no</span>}
                        </td>
                      </tr>
                    ))}
                    {data.bookings.length === 0 ? (
                      <tr>
                        <td className="p-2 text-textMuted" colSpan={6}>
                          No bookings.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-3 text-sm font-semibold text-textPrimary">Payments ({data.payments.length})</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-left text-textMuted">
                    <tr>
                      <th className="p-2">Date</th>
                      <th className="p-2">Status</th>
                      <th className="p-2 text-right">Amount</th>
                      <th className="p-2">Stripe PI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={p.public_id} className="border-t border-border">
                        <td className="p-2 text-textSecondary">{p.created_at?.slice(0, 10) ?? "—"}</td>
                        <td className="p-2 text-textPrimary">{p.status}</td>
                        <td className="p-2 text-right text-textPrimary">{formatCents(p.amount)}</td>
                        <td className="p-2 font-mono text-[10px] text-textSecondary">
                          {p.stripe_payment_intent_id ?? "—"}
                        </td>
                      </tr>
                    ))}
                    {data.payments.length === 0 ? (
                      <tr>
                        <td className="p-2 text-textMuted" colSpan={4}>
                          No payments.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-3 text-sm font-semibold text-textPrimary">Subscriptions ({data.subscriptions.length})</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-left text-textMuted">
                    <tr>
                      <th className="p-2">Status</th>
                      <th className="p-2">Start</th>
                      <th className="p-2">End</th>
                      <th className="p-2">Stripe Sub</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subscriptions.map((s) => (
                      <tr key={s.public_id} className="border-t border-border">
                        <td className="p-2 text-textPrimary">{s.status}</td>
                        <td className="p-2 text-textSecondary">{s.start_date ?? "—"}</td>
                        <td className="p-2 text-textSecondary">{s.end_date ?? "—"}</td>
                        <td className="p-2 font-mono text-[10px] text-textSecondary">
                          {s.stripe_subscription_id ?? "—"}
                        </td>
                      </tr>
                    ))}
                    {data.subscriptions.length === 0 ? (
                      <tr>
                        <td className="p-2 text-textMuted" colSpan={4}>
                          No subscriptions.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-3 text-sm font-semibold text-textPrimary">Audit trail ({data.audit_logs.length})</div>
              <div className="grid gap-2">
                {data.audit_logs.map((log) => (
                  <div key={log.public_id} className="rounded-sm border border-border p-2 text-xs">
                    <div className="text-textPrimary">{log.action}</div>
                    <div className="text-textMuted">
                      {log.entity_type} · {log.entity_public_id} · {log.actor_email ?? "system"} ·{" "}
                      {log.created_at?.replace("T", " ").slice(0, 19) ?? "—"}
                    </div>
                  </div>
                ))}
                {data.audit_logs.length === 0 ? (
                  <div className="text-xs text-textMuted">No audit entries.</div>
                ) : null}
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}
