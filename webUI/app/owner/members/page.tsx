"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatCurrency } from "@/lib/calendar";
import {
  MEMBER_STATUSES,
  MemberListItem,
  MemberStatus,
  memberStatusBadgeClass,
} from "@/lib/members";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | MemberStatus;

interface Organization {
  public_id: string;
  name: string;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...MEMBER_STATUSES.map((s) => ({ value: s as StatusFilter, label: s })),
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default function OwnerMembersPage() {
  const searchParams = useSearchParams();
  const requestedOrgId = searchParams.get("organization_public_id") ?? "";
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgId, setOrgId] = useState("");
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    let active = true;
    const token = getAccessToken() ?? undefined;
    if (!token) {
      setOrgsLoading(false);
      setLoading(false);
      setError("Sign in required");
      return;
    }

    apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token)
      .then((list) => {
        if (!active) return;
        setOrgs(list);
        const requested = list.find((org) => org.public_id === requestedOrgId);
        setOrgId((current) => requested?.public_id || current || list[0]?.public_id || "");
        setOrgsLoading(false);
        if (list.length === 0) setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load organizations");
        setOrgsLoading(false);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [requestedOrgId]);

  const load = useCallback(async () => {
    if (orgsLoading) return;
    const token = getAccessToken() ?? undefined;
    if (!token) {
      setLoading(false);
      setError("Sign in required");
      return;
    }
    if (!orgId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("organization_public_id", orgId);
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      const result = await apiFetch<MemberListItem[]>(
        `/api/owner/members?${params.toString()}`,
        { method: "GET" },
        token
      );
      setMembers(result);
    } catch (err) {
      setMembers([]);
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [orgId, orgsLoading, search, statusFilter]);

  useEffect(() => {
    if (!orgsLoading) load();
  }, [load, orgsLoading]);

  function memberHref(member: MemberListItem): string {
    const params = new URLSearchParams({ organization_public_id: member.organization_public_id });
    return `/owner/members/${encodeURIComponent(member.user_public_id)}?${params.toString()}`;
  }

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: members.length };
    for (const m of members) {
      out[m.status] = (out[m.status] ?? 0) + 1;
    }
    return out;
  }, [members]);

  return (
    <AppShell>
      <div className="grid gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-textPrimary">Members</h2>
          <p className="text-textSecondary">
            Anyone who has booked, requested, or subscribed to a space at your locations.
          </p>
        </div>

        <Card className="p-4">
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,320px)_1fr]">
              <div className="grid gap-1.5">
                <Label htmlFor="member-org">Organization</Label>
                <select
                  id="member-org"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
                >
                  <option value="">Select an organization</option>
                  {orgs.map((org) => (
                    <option key={org.public_id} value={org.public_id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email"
                  className="md:max-w-sm"
                />
                <Button type="button" onClick={load} disabled={!orgId}>
                  Search
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const count = counts[opt.value] ?? 0;
                const active = statusFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatusFilter(opt.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs",
                      active
                        ? "border-accent bg-accent text-white"
                        : "border-border bg-surface text-textSecondary hover:border-accent/50"
                    )}
                  >
                    {opt.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {error ? <div className="text-sm text-error">{error}</div> : null}

        {loading ? (
          <div className="text-sm text-textMuted">Loading owner members...</div>
        ) : !orgId ? (
          <Card className="p-6 text-center text-sm text-textMuted">Select an organization to view members.</Card>
        ) : members.length === 0 ? (
          <Card className="p-6 text-center text-sm text-textMuted">No members have been added to this organization yet.</Card>
        ) : (
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-xs uppercase tracking-wide text-textMuted">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Bookings</th>
                  <th className="px-3 py-2 text-right">Revenue</th>
                  <th className="px-3 py-2 text-left">Last booking</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_public_id} className="border-t border-border hover:bg-surface2">
                    <td className="px-3 py-2 align-top">
                      <Link
                        href={memberHref(m)}
                        className="font-medium text-textPrimary hover:underline"
                      >
                        {m.name}
                      </Link>
                      {m.company_name ? (
                        <div className="text-xs text-textMuted">{m.company_name}</div>
                      ) : null}
                      {m.tags.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-accentSubtle px-2 py-0.5 text-[10px] text-accent"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-top text-textPrimary">{m.email}</td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={cn(
                          "inline-flex rounded-sm border px-2 py-0.5 text-xs capitalize",
                          memberStatusBadgeClass(m.status)
                        )}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-right text-textPrimary">
                      <div>{m.stats.confirmed_bookings} confirmed</div>
                      <div className="text-xs text-textMuted">{m.stats.total_bookings} total</div>
                    </td>
                    <td className="px-3 py-2 align-top text-right text-textPrimary">
                      {formatCurrency(m.stats.total_revenue_cents)}
                    </td>
                    <td className="px-3 py-2 align-top text-textMuted">
                      {formatDate(m.stats.last_booking_at)}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <Link
                        href={memberHref(m)}
                        className="rounded-sm border border-border px-3 py-1 text-xs text-textSecondary hover:bg-surface2"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
