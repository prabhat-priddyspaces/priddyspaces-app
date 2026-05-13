"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { invalidateMeCache } from "@/hooks/useMe";
import { formatAdminLabel } from "@/lib/admin-format";
import { apiFetch } from "@/lib/api";
import { getAccessToken, setAccessToken } from "@/lib/auth";

interface OwnerUserRecord {
  membership_public_id: string;
  user_public_id: string;
  email: string;
  name: string;
  organization_name: string;
  organization_review_status: string;
  role: string;
  assigned_locations: number;
}

interface ImpersonationResponse {
  access_token: string;
  default_route: string;
}

export default function AdminOwnerUsersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<OwnerUserRecord[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  async function loadRows(search: string) {
    const token = getAccessToken() ?? undefined;
    const q = search.trim();
    const path = q ? `/api/admin/owner-users?q=${encodeURIComponent(q)}` : "/api/admin/owner-users";
    const result = await apiFetch<OwnerUserRecord[]>(path, { method: "GET" }, token);
    setRows(result);
  }

  useEffect(() => {
    loadRows("").catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load owner users"));
  }, []);

  async function impersonateOwner(userPublicId: string) {
    const token = getAccessToken() ?? undefined;
    const response = await apiFetch<ImpersonationResponse>(
      "/api/admin/impersonation/start",
      {
        method: "POST",
        body: JSON.stringify({
          user_public_id: userPublicId,
          reason: "Owner support review",
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
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Owner Users</h2>
          <p className="text-text-2">Review owner-side accounts and impersonate for operational support.</p>
        </div>
        <Card className="p-4">
          <div className="flex gap-3">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search owner user or company" />
            <Button type="button" onClick={() => loadRows(query).catch((err) => setMessage(String(err)))}>
              Search
            </Button>
          </div>
        </Card>
        {message ? <div className="text-sm text-danger">{message}</div> : null}
        <div className="grid gap-3">
          {rows.map((row) => (
            <Card key={row.membership_public_id} className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <Link
                    href={`/admin/owner-users/_?id=${encodeURIComponent(row.user_public_id)}`}
                    className="font-semibold text-text hover:underline"
                  >
                    {row.name}
                  </Link>
                  <div className="text-sm text-text-3">{row.email}</div>
                  <div className="text-sm text-text-3">
                    {row.organization_name} • {formatAdminLabel(row.role)} • {row.assigned_locations} assigned locations • {formatAdminLabel(row.organization_review_status)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/owner-users/_?id=${encodeURIComponent(row.user_public_id)}`}
                    className="rounded-sm border border-line px-3 py-2 text-sm text-text-2 hover:bg-surface-2"
                  >
                    View details
                  </Link>
                  <Button type="button" onClick={() => impersonateOwner(row.user_public_id).catch((err) => setMessage(String(err)))}>
                    Impersonate
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {rows.length === 0 ? <Card className="p-4 text-sm text-text-3">No owner users found.</Card> : null}
        </div>
      </div>
    </AdminShell>
  );
}
