"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { formatAdminDateTime, formatAdminLabel } from "@/lib/admin-format";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface AuditLogRecord {
  public_id: string;
  action: string;
  action_label?: string;
  entity_type: string;
  entity_public_id: string;
  entity_label?: string;
  actor_name: string | null;
  actor_email: string | null;
  acting_as_name: string | null;
  acting_as_email: string | null;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  context?: Record<string, unknown> | null;
  created_at: string | null;
}

function formatJson(value: Record<string, unknown> | null | undefined) {
  return value ? JSON.stringify(value, null, 2) : "None";
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<AuditLogRecord[]>("/api/admin/audit-logs", { method: "GET" }, token)
      .then(setLogs)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load audit logs"));
  }, []);

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-textPrimary">Audit Logs</h2>
          <p className="text-textSecondary">Track platform role changes, impersonation, approvals, and settings updates.</p>
        </div>
        {message ? <div className="text-sm text-error">{message}</div> : null}
        <div className="grid gap-3">
          {logs.map((log) => (
            <Card key={log.public_id} className="p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="font-semibold text-textPrimary">{log.action_label || formatAdminLabel(log.action)}</div>
                  <div className="text-sm text-textSecondary">{log.entity_label || log.entity_public_id}</div>
                  <div className="text-sm text-textMuted">
                    {formatAdminLabel(log.entity_type)} • Actor {log.actor_name || log.actor_email || "System"}
                    {log.acting_as_name || log.acting_as_email
                      ? ` • Acting as ${log.acting_as_name || log.acting_as_email}`
                      : ""}
                  </div>
                </div>
                <div className="text-xs text-textMuted">{formatAdminDateTime(log.created_at)}</div>
              </div>
              <details className="mt-3 text-xs text-textMuted">
                <summary className="cursor-pointer text-textSecondary">Raw details</summary>
                <div className="mt-2 grid gap-2 rounded-sm bg-surface2 p-3">
                  <div>ID {log.public_id}</div>
                  <div>Entity ID {log.entity_public_id}</div>
                  <div>
                    <div className="font-medium text-textSecondary">Before</div>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{formatJson(log.before_state)}</pre>
                  </div>
                  <div>
                    <div className="font-medium text-textSecondary">After</div>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{formatJson(log.after_state)}</pre>
                  </div>
                  <div>
                    <div className="font-medium text-textSecondary">Context</div>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{formatJson(log.context)}</pre>
                  </div>
                </div>
              </details>
            </Card>
          ))}
          {logs.length === 0 ? <Card className="p-4 text-sm text-textMuted">No audit logs found.</Card> : null}
        </div>
      </div>
    </AdminShell>
  );
}
