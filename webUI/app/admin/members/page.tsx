"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { invalidateMeCache } from "@/hooks/useMe";
import { apiFetch } from "@/lib/api";
import { getAccessToken, setAccessToken } from "@/lib/auth";

interface MemberRecord {
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

export default function AdminMembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [query, setQuery] = useState("");
  const [signupFrom, setSignupFrom] = useState("");
  const [signupTo, setSignupTo] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [message, setMessage] = useState("");

  const loadMembers = useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (signupFrom) params.set("signup_from", signupFrom);
    if (signupTo) params.set("signup_to", signupTo);
    if (filter === "subscribed") params.set("has_subscription", "true");
    else if (filter === "not_subscribed") params.set("has_subscription", "false");
    else if (filter === "failed_payments") params.set("has_failed_payments", "true");
    const qs = params.toString();
    const path = qs ? `/api/admin/members?${qs}` : "/api/admin/members";
    try {
      const result = await apiFetch<MemberRecord[]>(path, { method: "GET" }, token);
      setMembers(result);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load members");
    }
  }, [query, signupFrom, signupTo, filter]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function impersonateMember(userPublicId: string) {
    const token = getAccessToken() ?? undefined;
    const response = await apiFetch<ImpersonationResponse>(
      "/api/admin/impersonation/start",
      {
        method: "POST",
        body: JSON.stringify({
          user_public_id: userPublicId,
          reason: "Member support review",
        }),
      },
      token
    );
    setAccessToken(response.access_token);
    invalidateMeCache();
    router.replace(response.default_route);
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Members</h2>
          <p className="text-text-2">Search and filter members, drill into activity, or impersonate.</p>
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
              <Button type="button" onClick={() => loadMembers()}>
                Search
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-text-3">
              <label className="flex items-center gap-2">
                Signup from
                <input
                  type="date"
                  value={signupFrom}
                  onChange={(e) => setSignupFrom(e.target.value)}
                  className="h-9 rounded-sm border border-line bg-white px-2 text-sm text-text"
                />
              </label>
              <label className="flex items-center gap-2">
                to
                <input
                  type="date"
                  value={signupTo}
                  onChange={(e) => setSignupTo(e.target.value)}
                  className="h-9 rounded-sm border border-line bg-white px-2 text-sm text-text"
                />
              </label>
              {(["all", "subscribed", "not_subscribed", "failed_payments"] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 ${
                    filter === f
                      ? "bg-brandSubtle text-brand"
                      : "border border-line text-text-2 hover:bg-surface-2"
                  }`}
                >
                  {f.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        </Card>
        {message ? <div className="text-sm text-danger">{message}</div> : null}
        <div className="grid gap-3">
          {members.map((member) => (
            <Card key={member.public_id} className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <Link
                    href={`/admin/members/${encodeURIComponent(member.public_id)}`}
                    className="font-semibold text-text hover:underline"
                  >
                    {member.name}
                  </Link>
                  <div className="text-sm text-text-3">{member.email}</div>
                  <div className="text-sm text-text-3">
                    Bookings {member.bookings} • Payments {member.payments} • Subscriptions {member.subscriptions}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/members/${encodeURIComponent(member.public_id)}`}
                    className="rounded-sm border border-line px-3 py-2 text-sm text-text-2 hover:bg-surface-2"
                  >
                    View details
                  </Link>
                  <Button
                    type="button"
                    onClick={() => impersonateMember(member.public_id).catch((err) => setMessage(String(err)))}
                  >
                    Impersonate
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {members.length === 0 ? <Card className="p-4 text-sm text-text-3">No members found.</Card> : null}
        </div>
      </div>
    </AdminShell>
  );
}
