"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { formatAdminDateTime, formatAdminLabel } from "@/lib/admin-format";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface OwnerUserDetail {
  profile: {
    public_id: string;
    email: string;
    name: string;
    role: string | null;
    is_active: boolean;
    email_verified: boolean;
    created_at: string | null;
  };
  organizations: Array<{
    organization_public_id: string;
    organization_name: string;
    review_status: string;
    role: string;
    can_override_pricing: boolean;
    is_active: boolean;
  }>;
  audit_logs: Array<{
    public_id: string;
    action: string;
    action_label?: string;
    entity_type: string;
    entity_public_id: string;
    entity_label?: string;
    actor_email: string | null;
    created_at: string | null;
  }>;
}

export function AdminOwnerUserDetailClient() {
  const params = useParams<{ public_id: string }>();
  const searchParams = useSearchParams();
  const ownerPublicId = searchParams.get("id") || (params.public_id === "_" ? "" : params.public_id);
  const [data, setData] = useState<OwnerUserDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!ownerPublicId) return;
    const token = getAccessToken() ?? undefined;
    try {
      const result = await apiFetch<OwnerUserDetail>(
        `/api/admin/owner-users/${ownerPublicId}`,
        { method: "GET" },
        token
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user");
    }
  }, [ownerPublicId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <Link href="/admin/owner-users" className="text-xs text-accent hover:underline">
            ← Back to owner users
          </Link>
        </div>
        {error ? <div className="text-sm text-error">{error}</div> : null}
        {data ? (
          <>
            <Card className="p-4">
              <h2 className="text-xl font-semibold text-textPrimary">{data.profile.name}</h2>
              <div className="text-sm text-textSecondary">{data.profile.email}</div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-textMuted">
                <span>Role: {formatAdminLabel(data.profile.role)}</span>
                <span>Active: {data.profile.is_active ? "yes" : "no"}</span>
                <span>Created: {data.profile.created_at?.slice(0, 10) ?? "—"}</span>
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-3 text-sm font-semibold text-textPrimary">Organizations ({data.organizations.length})</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-left text-textMuted">
                    <tr>
                      <th className="p-2">Organization</th>
                      <th className="p-2">Review</th>
                      <th className="p-2">Role</th>
                      <th className="p-2">Pricing override</th>
                      <th className="p-2">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.organizations.map((o) => (
                      <tr key={o.organization_public_id} className="border-t border-border">
                        <td className="p-2 text-textPrimary">{o.organization_name}</td>
                        <td className="p-2 text-textSecondary">{formatAdminLabel(o.review_status)}</td>
                        <td className="p-2 text-textSecondary">{formatAdminLabel(o.role)}</td>
                        <td className="p-2 text-textSecondary">{o.can_override_pricing ? "yes" : "no"}</td>
                        <td className="p-2 text-textSecondary">{o.is_active ? "yes" : "no"}</td>
                      </tr>
                    ))}
                    {data.organizations.length === 0 ? (
                      <tr>
                        <td className="p-2 text-textMuted" colSpan={5}>
                          No organizations.
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
                    <div className="text-textPrimary">{log.action_label || formatAdminLabel(log.action)}</div>
                    <div className="text-textMuted">
                      {formatAdminLabel(log.entity_type)} · {log.entity_label || log.entity_public_id} · {log.actor_email ?? "system"} ·{" "}
                      {formatAdminDateTime(log.created_at)}
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
