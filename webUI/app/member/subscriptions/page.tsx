"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Subscription {
  public_id: string;
  space_public_id: string | null;
  space_type: string | null;
  location_name: string | null;
  status: string;
  start_date: string;
  end_date: string | null;
}

export default function MemberSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadSubscriptions() {
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<Subscription[]>("/api/subscriptions", { method: "GET" }, token);
    setSubscriptions(list);
  }

  useEffect(() => {
    loadSubscriptions()
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load memberships"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCancel(publicId: string) {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    if (!window.confirm("Cancel this membership at the end of the current billing period?")) {
      return;
    }

    setBusyId(publicId);
    setMessage("");
    try {
      await apiFetch(`/api/subscriptions/${publicId}/cancel`, { method: "POST" }, token);
      await loadSubscriptions();
      setMessage("Membership update saved.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to cancel membership");
    } finally {
      setBusyId(null);
    }
  }

  const stats = [
    {
      label: "Active",
      value: subscriptions.filter((subscription) => subscription.status === "active").length,
    },
    {
      label: "Past Due",
      value: subscriptions.filter((subscription) => subscription.status === "past_due").length,
    },
    {
      label: "Canceling",
      value: subscriptions.filter((subscription) => subscription.status === "canceling").length,
    },
  ];

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-textPrimary">Memberships</h1>
            <p className="mt-1 text-textSecondary">
              Manage active workspace memberships, billing status, and cancellation timing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/member">
              <Button variant="secondary">Find a space</Button>
            </Link>
          </div>
        </div>

        {message ? <div className="mt-4 text-sm text-textMuted">{message}</div> : null}

        {subscriptions.some((subscription) => subscription.status === "past_due") ? (
          <Card className="mt-6 border border-border p-4">
            <div className="text-sm font-semibold text-textPrimary">Billing attention needed</div>
            <div className="mt-1 text-sm text-textSecondary">
              One or more memberships are past due. Visit Payments to update membership billing.
            </div>
          </Card>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-4">
              <div className="text-sm text-textMuted">{stat.label}</div>
              <div className="mt-2 text-2xl font-semibold text-textPrimary">{stat.value}</div>
            </Card>
          ))}
        </div>

        {loading ? (
          <div className="mt-6 text-sm text-textMuted">Loading memberships...</div>
        ) : subscriptions.length === 0 ? (
          <Card className="mt-6 p-6">
            <div className="text-sm text-textMuted">No active workspace memberships yet.</div>
            <Link href="/member" className="mt-4 inline-flex">
              <Button size="sm">Browse available spaces</Button>
            </Link>
          </Card>
        ) : (
          <div className="mt-6 grid gap-4">
            {subscriptions.map((subscription) => (
              <Card key={subscription.public_id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-base font-semibold text-textPrimary">
                      {subscription.location_name || "Workspace membership"}
                    </div>
                    <div className="text-sm text-textSecondary">
                      {subscription.space_type || "Membership"} • {subscription.status}
                    </div>
                    <div className="text-sm text-textMuted">
                      Starts {new Date(subscription.start_date).toLocaleDateString()}
                      {subscription.end_date
                        ? ` • Ends ${new Date(subscription.end_date).toLocaleDateString()}`
                        : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {subscription.space_public_id ? (
                      <Link href={`/member/spaces/${subscription.space_public_id}`}>
                        <Button size="sm" variant="secondary">
                          Open membership space
                        </Button>
                      </Link>
                    ) : null}
                    {subscription.status !== "canceled" && subscription.status !== "canceling" ? (
                      <Button
                        size="sm"
                        onClick={() => handleCancel(subscription.public_id)}
                        disabled={busyId === subscription.public_id}
                      >
                        {busyId === subscription.public_id ? "Updating..." : "Cancel membership"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
