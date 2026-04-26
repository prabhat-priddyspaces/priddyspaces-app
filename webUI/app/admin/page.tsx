"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface DashboardResponse {
  metrics: Record<string, number>;
  recent_activity: Array<{
    public_id: string;
    action: string;
    entity_type: string;
    entity_public_id: string;
    actor_email: string | null;
    created_at: string | null;
  }>;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<DashboardResponse>("/api/admin/dashboard", { method: "GET" }, token)
      .then(setData)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load dashboard"));
  }, []);

  const metrics = data?.metrics;

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-textPrimary">Platform Console</h2>
          <p className="text-textSecondary">Global platform activity, company approval, and earnings.</p>
        </div>
        {message ? <div className="text-sm text-error">{message}</div> : null}
        {metrics ? (
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ["Users", metrics.users],
              ["Customers", metrics.customers],
              ["Owner Companies", metrics.owner_companies],
              ["Live Listings", metrics.live_listings],
              ["Bookings", metrics.bookings],
              ["Requests", metrics.booking_requests],
              ["GMV", metrics.gmv],
              ["Platform Earnings", metrics.platform_earnings],
            ].map(([label, value]) => (
              <Card key={label} className="p-4">
                <div className="text-sm text-textMuted">{label}</div>
                <div className="mt-2 text-2xl font-semibold">{value}</div>
              </Card>
            ))}
          </div>
        ) : null}
        <Card className="p-4">
          <div className="text-sm font-semibold text-textPrimary">Recent activity</div>
          <div className="mt-4 grid gap-3">
            {data?.recent_activity.length ? (
              data.recent_activity.map((item) => (
                <div key={item.public_id} className="rounded-md border border-border p-3 text-sm">
                  <div className="font-medium text-textPrimary">{item.action}</div>
                  <div className="text-textMuted">
                    {item.entity_type} • {item.entity_public_id} • {item.actor_email || "system"}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-textMuted">No recent activity yet.</div>
            )}
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
