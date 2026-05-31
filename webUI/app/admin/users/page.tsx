"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatAdminDateTime, formatAdminLabel } from "@/lib/admin-format";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { MeResponse } from "@/lib/me";

type RoleFilter = "all" | "member" | "owner" | "platform" | "unassigned";
type StatusFilter = "" | "active" | "inactive";
type EmailVerifiedFilter = "" | "true" | "false";

interface AdminUser {
  public_id: string;
  email: string;
  name: string;
  role: string | null;
  app_role: string | null;
  platform_role: string | null;
  is_active: boolean;
  email_verified: boolean;
  created_at: string | null;
  last_activity_at: string | null;
  organization_count: number;
  bookings: number;
  payments: number;
  subscriptions: number;
}

interface UsersResponse {
  results: AdminUser[];
  total: number;
  page: number;
  page_size: number;
}

interface OwnerInviteForm {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  company_name: string;
}

const selectClass =
  "h-9 rounded-xl border border-line-strong bg-surface px-3 text-[13px] text-text outline-none transition focus:border-brand focus-visible:shadow-ring";

const emptyOwnerInviteForm: OwnerInviteForm = {
  email: "",
  first_name: "",
  last_name: "",
  phone: "",
  company_name: "",
};

function detailHref(user: AdminUser): string | null {
  if (user.app_role === "member") {
    return `/admin/members/${encodeURIComponent(user.public_id)}`;
  }
  if (user.app_role === "owner" || user.organization_count > 0) {
    return `/admin/owner-users/${encodeURIComponent(user.public_id)}`;
  }
  return null;
}

function roleLabel(user: AdminUser): string {
  if (user.platform_role) return `Platform ${formatAdminLabel(user.platform_role)}`;
  if (user.app_role) return formatAdminLabel(user.app_role);
  return "Unassigned";
}

export default function AdminUsersPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [data, setData] = useState<UsersResponse | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("");
  const [emailVerified, setEmailVerified] = useState<EmailVerifiedFilter>("");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [inviteForm, setInviteForm] = useState<OwnerInviteForm>(emptyOwnerInviteForm);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  const isSuperadmin = me?.platform_role === "superadmin";

  const loadUsers = useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: "25",
    });
    if (submittedQuery) params.set("q", submittedQuery);
    if (role !== "all") params.set("role", role);
    if (status) params.set("status", status);
    if (emailVerified) params.set("email_verified", emailVerified);
    try {
      const result = await apiFetch<UsersResponse>(
        `/api/admin/users?${params.toString()}`,
        { method: "GET" },
        token
      );
      setData(result);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load users");
    }
  }, [emailVerified, page, role, status, submittedQuery]);

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<MeResponse>("/api/me", { method: "GET" }, token).then(setMe).catch(() => null);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.page_size));
  }, [data]);

  function applySearch() {
    setPage(1);
    setSubmittedQuery(query.trim());
  }

  async function inviteOwner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteMessage("");
    setInviteLoading(true);
    try {
      const token = getAccessToken() ?? undefined;
      await apiFetch(
        "/api/admin/owner-invites",
        {
          method: "POST",
          body: JSON.stringify({
            email: inviteForm.email,
            first_name: inviteForm.first_name || undefined,
            last_name: inviteForm.last_name || undefined,
            phone: inviteForm.phone || undefined,
            company_name: inviteForm.company_name || undefined,
          }),
        },
        token
      );
      setInviteForm(emptyOwnerInviteForm);
      setInviteMessage("Owner invite sent.");
      setPage(1);
      setRole("owner");
      await loadUsers();
    } catch (err) {
      setInviteMessage(err instanceof Error ? err.message : "Failed to send owner invite");
    } finally {
      setInviteLoading(false);
    }
  }

  function updateInviteField(field: keyof OwnerInviteForm, value: string) {
    setInviteForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <AdminShell title="Users" breadcrumb={["Admin", "Accounts"]}>
      <div className="space-y-6">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">
            Users
          </h2>
          <p className="text-text-2">
            Search all platform, owner-side, and member accounts.
          </p>
        </div>

        <Card className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 md:flex-row">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applySearch();
                }}
                placeholder="Search by email or name"
                className="md:max-w-sm"
                data-testid="admin-users-search"
              />
              <Button type="button" onClick={applySearch}>
                Search
              </Button>
            </div>
            <div className="flex flex-wrap gap-3">
              <select
                value={role}
                onChange={(event) => {
                  setPage(1);
                  setRole(event.target.value as RoleFilter);
                }}
                className={selectClass}
                aria-label="Filter by role"
              >
                <option value="all">All roles</option>
                <option value="member">Members</option>
                <option value="owner">Owners</option>
                <option value="platform">Platform team</option>
                <option value="unassigned">Unassigned</option>
              </select>
              <select
                value={status}
                onChange={(event) => {
                  setPage(1);
                  setStatus(event.target.value as StatusFilter);
                }}
                className={selectClass}
                aria-label="Filter by status"
              >
                <option value="">Any status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select
                value={emailVerified}
                onChange={(event) => {
                  setPage(1);
                  setEmailVerified(event.target.value as EmailVerifiedFilter);
                }}
                className={selectClass}
                aria-label="Filter by email verification"
              >
                <option value="">Any email state</option>
                <option value="true">Verified email</option>
                <option value="false">Unverified email</option>
              </select>
            </div>
          </div>
        </Card>

        {isSuperadmin ? (
          <Card className="p-4">
            <form onSubmit={inviteOwner} className="grid gap-3">
              <div className="text-sm font-semibold text-text">Invite owner</div>
              <div className="grid gap-3 md:grid-cols-5">
                <Input
                  type="email"
                  value={inviteForm.email}
                  onChange={(event) => updateInviteField("email", event.target.value)}
                  placeholder="owner@example.com"
                  aria-label="Owner email"
                  required
                />
                <Input
                  value={inviteForm.first_name}
                  onChange={(event) => updateInviteField("first_name", event.target.value)}
                  placeholder="First name"
                  aria-label="Owner first name"
                />
                <Input
                  value={inviteForm.last_name}
                  onChange={(event) => updateInviteField("last_name", event.target.value)}
                  placeholder="Last name"
                  aria-label="Owner last name"
                />
                <Input
                  value={inviteForm.phone}
                  onChange={(event) => updateInviteField("phone", event.target.value)}
                  placeholder="Phone"
                  aria-label="Owner phone"
                />
                <Input
                  value={inviteForm.company_name}
                  onChange={(event) => updateInviteField("company_name", event.target.value)}
                  placeholder="Business name"
                  aria-label="Owner business name"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={inviteLoading}>
                  {inviteLoading ? "Sending..." : "Send owner invite"}
                </Button>
                {inviteMessage ? (
                  <span
                    className={`text-sm ${inviteMessage.endsWith("sent.") ? "text-success" : "text-danger"}`}
                  >
                    {inviteMessage}
                  </span>
                ) : null}
              </div>
            </form>
          </Card>
        ) : null}

        {message ? <div className="text-sm text-danger">{message}</div> : null}

        <div className="flex items-center justify-between gap-3 text-sm text-text-3">
          <div data-testid="admin-users-count">
            {data ? `${data.total} users` : "Loading users"}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <span className="font-mono text-xs">
              {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>

        <div className="grid gap-3">
          {data?.results.map((user) => {
            const href = detailHref(user);
            return (
              <Card key={user.public_id} className="p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {href ? (
                        <Link
                          href={href}
                          className="font-semibold text-text hover:underline"
                        >
                          {user.name}
                        </Link>
                      ) : (
                        <div className="font-semibold text-text">{user.name}</div>
                      )}
                      <Badge variant={user.is_active ? "mint" : "danger"} dot>
                        {user.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant={user.email_verified ? "info" : "warning"}>
                        {user.email_verified ? "Verified" : "Unverified"}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-text-3">{user.email}</div>
                    <div className="mt-1 text-sm text-text-3">
                      {roleLabel(user)} • Organizations {user.organization_count} •
                      Bookings {user.bookings} • Payments {user.payments} •
                      Subscriptions {user.subscriptions}
                    </div>
                    <div className="mt-1 text-xs text-text-3">
                      Created {formatAdminDateTime(user.created_at)} • Last activity{" "}
                      {formatAdminDateTime(user.last_activity_at)}
                    </div>
                  </div>
                  {href ? (
                    <Link
                      href={href}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-line px-3 text-sm font-medium text-text-2 transition-colors hover:bg-surface-2"
                    >
                      View account details
                    </Link>
                  ) : null}
                </div>
              </Card>
            );
          })}
          {data && data.results.length === 0 ? (
            <Card className="p-4 text-sm text-text-3">No users found.</Card>
          ) : null}
        </div>
      </div>
    </AdminShell>
  );
}
