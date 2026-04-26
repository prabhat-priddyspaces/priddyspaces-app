"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken, setAccessToken } from "@/lib/auth";

interface CustomerRecord {
  public_id: string;
  email: string;
  name: string;
  is_active: boolean;
  email_verified: boolean;
  bookings: number;
  payments: number;
  subscriptions: number;
}

interface ImpersonationResponse {
  access_token: string;
  default_route: string;
}

type Filter = "all" | "subscribed" | "not_subscribed" | "failed_payments";

export default function AdminCustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [query, setQuery] = useState("");
  const [signupFrom, setSignupFrom] = useState("");
  const [signupTo, setSignupTo] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [message, setMessage] = useState("");

  const loadCustomers = useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (signupFrom) params.set("signup_from", signupFrom);
    if (signupTo) params.set("signup_to", signupTo);
    if (filter === "subscribed") params.set("has_subscription", "true");
    else if (filter === "not_subscribed") params.set("has_subscription", "false");
    else if (filter === "failed_payments") params.set("has_failed_payments", "true");
    const qs = params.toString();
    const path = qs ? `/api/admin/customers?${qs}` : "/api/admin/customers";
    try {
      const result = await apiFetch<CustomerRecord[]>(path, { method: "GET" }, token);
      setCustomers(result);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load customers");
    }
  }, [query, signupFrom, signupTo, filter]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  async function impersonateCustomer(userPublicId: string) {
    const token = getAccessToken() ?? undefined;
    const response = await apiFetch<ImpersonationResponse>(
      "/api/admin/impersonation/start",
      {
        method: "POST",
        body: JSON.stringify({
          user_public_id: userPublicId,
          reason: "Customer support review",
        }),
      },
      token
    );
    setAccessToken(response.access_token);
    router.push(response.default_route);
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-textPrimary">Customers</h2>
          <p className="text-textSecondary">Search and filter customers, drill into activity, or impersonate.</p>
        </div>
        <Card className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by email or name"
                className="md:max-w-sm"
              />
              <Button type="button" onClick={() => loadCustomers()}>
                Search
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-textMuted">
              <label className="flex items-center gap-2">
                Signup from
                <input
                  type="date"
                  value={signupFrom}
                  onChange={(e) => setSignupFrom(e.target.value)}
                  className="h-9 rounded-sm border border-border bg-white px-2 text-sm text-textPrimary"
                />
              </label>
              <label className="flex items-center gap-2">
                to
                <input
                  type="date"
                  value={signupTo}
                  onChange={(e) => setSignupTo(e.target.value)}
                  className="h-9 rounded-sm border border-border bg-white px-2 text-sm text-textPrimary"
                />
              </label>
              {(["all", "subscribed", "not_subscribed", "failed_payments"] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 ${
                    filter === f
                      ? "bg-accentSubtle text-accent"
                      : "border border-border text-textSecondary hover:bg-surface2"
                  }`}
                >
                  {f.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        </Card>
        {message ? <div className="text-sm text-error">{message}</div> : null}
        <div className="grid gap-3">
          {customers.map((customer) => (
            <Card key={customer.public_id} className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <Link
                    href={`/admin/customers/${customer.public_id}`}
                    className="font-semibold text-textPrimary hover:underline"
                  >
                    {customer.name}
                  </Link>
                  <div className="text-sm text-textMuted">{customer.email}</div>
                  <div className="text-sm text-textMuted">
                    Bookings {customer.bookings} • Payments {customer.payments} • Subscriptions {customer.subscriptions}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/customers/${customer.public_id}`}
                    className="rounded-sm border border-border px-3 py-2 text-sm text-textSecondary hover:bg-surface2"
                  >
                    View details
                  </Link>
                  <Button
                    type="button"
                    onClick={() => impersonateCustomer(customer.public_id).catch((err) => setMessage(String(err)))}
                  >
                    Impersonate
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {customers.length === 0 ? <Card className="p-4 text-sm text-textMuted">No customers found.</Card> : null}
        </div>
      </div>
    </AdminShell>
  );
}
