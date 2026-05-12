"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface BookingRequest {
  status: string;
  estimated_amount: number | null;
}

interface Payment {
  amount: number;
  status: string;
  created_at: string;
}

interface Invoice {
  amount: number;
  created_at: string;
}

interface Organization {
  public_id: string;
  name: string;
}

interface Location {
  public_id: string;
  name: string;
  city: string | null;
}

interface Space {
  public_id: string;
  availability_status: string;
}

interface Subscription {
  status: string;
}

interface LocationSummary {
  public_id: string;
  name: string;
  city: string | null;
  totalSpaces: number;
  occupiedSpaces: number;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function OwnerDashboard() {
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [membersCount, setMembersCount] = useState(0);
  const [locationSummaries, setLocationSummaries] = useState<LocationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      const token = getAccessToken() ?? undefined;
      setLoading(true);
      setError("");

      try {
        const [requestsResp, paymentsResp, invoicesResp, orgsResp, subscriptionsResp] = await Promise.all([
          apiFetch<BookingRequest[]>("/api/booking-requests", { method: "GET" }, token).catch(() => []),
          apiFetch<Payment[]>("/api/payments", { method: "GET" }, token).catch(() => []),
          apiFetch<Invoice[]>("/api/invoices", { method: "GET" }, token).catch(() => []),
          apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token).catch(() => []),
          apiFetch<Subscription[]>("/api/subscriptions", { method: "GET" }, token).catch(() => []),
        ]);

        if (!active) return;

        setRequests(requestsResp);
        setPayments(paymentsResp);
        setInvoices(invoicesResp);
        setSubscriptions(subscriptionsResp);

        if (orgsResp.length === 0) {
          setMembersCount(0);
          setLocationSummaries([]);
          return;
        }

        const orgId = orgsResp[0].public_id;
        const [membersResp, locationsResp] = await Promise.all([
          apiFetch<unknown[]>(`/api/orgs/${orgId}/members`, { method: "GET" }, token).catch(() => []),
          apiFetch<Location[]>(
            `/api/locations?organization_public_id=${orgId}`,
            { method: "GET" },
            token
          ).catch(() => []),
        ]);

        if (!active) return;

        setMembersCount(membersResp.length);

        const spacesByLocation = await Promise.all(
          locationsResp.map((location) =>
            apiFetch<Space[]>(`/api/locations/${location.public_id}/spaces`, { method: "GET" }, token).catch(
              () => []
            )
          )
        );

        if (!active) return;

        setLocationSummaries(
          locationsResp.map((location, index) => {
            const spaces = spacesByLocation[index] ?? [];
            return {
              public_id: location.public_id,
              name: location.name,
              city: location.city,
              totalSpaces: spaces.length,
              occupiedSpaces: spaces.filter((space) => space.availability_status !== "available").length,
            };
          })
        );
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const pendingRequests = requests.filter((request) => request.status === "requested").length;
    const approvedRequests = requests.filter((request) => request.status === "approved").length;
    const openRequestValue = requests
      .filter((request) => request.status === "requested")
      .reduce((sum, request) => sum + (request.estimated_amount || 0), 0);
    const monthRevenue = payments
      .filter((payment) => {
        const createdAt = new Date(payment.created_at);
        return (
          payment.status === "succeeded" &&
          createdAt.getMonth() === currentMonth &&
          createdAt.getFullYear() === currentYear
        );
      })
      .reduce((sum, payment) => sum + (payment.amount || 0), 0);
    const failedPayments = payments.filter((payment) => payment.status === "failed").length;
    const activeMemberships = subscriptions.filter((subscription) =>
      ["active", "trialing", "past_due", "canceling"].includes(subscription.status)
    ).length;
    const totalSpaces = locationSummaries.reduce((sum, location) => sum + location.totalSpaces, 0);
    const invoiceVolume = invoices.reduce((sum, invoice) => sum + (invoice.amount || 0), 0);

    return [
      { label: "Pending Requests", value: pendingRequests.toString() },
      { label: "Approved Requests", value: approvedRequests.toString() },
      { label: "Open Request Value", value: currency.format(openRequestValue) },
      { label: "MTD Revenue", value: currency.format(monthRevenue) },
      { label: "Failed Payments", value: failedPayments.toString() },
      { label: "Active Memberships", value: activeMemberships.toString() },
      { label: "Locations", value: locationSummaries.length.toString() },
      { label: "Spaces", value: totalSpaces.toString() },
      { label: "Invoice Volume", value: currency.format(invoiceVolume) },
      { label: "Team Members", value: membersCount.toString() },
    ];
  }, [invoices, locationSummaries, membersCount, payments, requests, subscriptions]);

  return (
    <AppShell>
      <div className="grid gap-6">
        <div>
          <h2 className="text-2xl font-semibold">Dashboard</h2>
          <p className="text-textSecondary">
            Revenue, membership, and location activity across your workspace portfolio.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/owner/calendar"
            className="rounded-md border border-accent/30 bg-accentSubtle p-4 text-accent transition hover:bg-accent hover:text-white"
          >
            <div className="text-sm font-semibold">Calendar</div>
            <div className="text-xs opacity-80">See what's booked, by whom, when.</div>
          </Link>
          <Link
            href="/owner/requests"
            className="rounded-md border border-border bg-surface p-4 text-textPrimary transition hover:border-accent/40"
          >
            <div className="text-sm font-semibold">Requests</div>
            <div className="text-xs text-textMuted">Approve, deny, or retry payment.</div>
          </Link>
          <Link
            href="/owner/members"
            className="rounded-md border border-border bg-surface p-4 text-textPrimary transition hover:border-accent/40"
          >
            <div className="text-sm font-semibold">Members</div>
            <div className="text-xs text-textMuted">Members who interact with your spaces.</div>
          </Link>
        </div>

        {error ? <div className="text-sm text-error">{error}</div> : null}

        {loading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {stats.map((stat) => (
                <Card key={stat.label} className="p-4">
                  <div className="text-sm text-textMuted">{stat.label}</div>
                  <div className="mt-2 text-2xl font-semibold text-textPrimary">{stat.value}</div>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {locationSummaries.map((location) => {
                const occupancyRate =
                  location.totalSpaces === 0
                    ? 0
                    : Math.round((location.occupiedSpaces / location.totalSpaces) * 100);

                return (
                  <Card key={location.public_id} className="p-4">
                    <div className="text-base font-semibold text-textPrimary">{location.name}</div>
                    <div className="mt-1 text-sm text-textMuted">
                      {location.city || "City not set"}
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-textMuted">Spaces</div>
                        <div className="mt-1 font-semibold text-textPrimary">
                          {location.totalSpaces}
                        </div>
                      </div>
                      <div>
                        <div className="text-textMuted">Occupied</div>
                        <div className="mt-1 font-semibold text-textPrimary">
                          {location.occupiedSpaces}
                        </div>
                      </div>
                      <div>
                        <div className="text-textMuted">Occupancy</div>
                        <div className="mt-1 font-semibold text-textPrimary">
                          {occupancyRate}%
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
