"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface AuditLogRecord {
  public_id: string;
  action: string;
  entity_type: string;
  entity_public_id: string;
  actor_email: string | null;
  acting_as_email: string | null;
  created_at: string | null;
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
              <div className="font-semibold text-textPrimary">{log.action}</div>
              <div className="text-sm text-textMuted">
                {log.entity_type} • {log.entity_public_id} • actor {log.actor_email || "system"}
                {log.acting_as_email ? ` • acting as ${log.acting_as_email}` : ""}
              </div>
            </Card>
          ))}
          {logs.length === 0 ? <Card className="p-4 text-sm text-textMuted">No audit logs found.</Card> : null}
        </div>
      </div>
    </AdminShell>
  );
}
