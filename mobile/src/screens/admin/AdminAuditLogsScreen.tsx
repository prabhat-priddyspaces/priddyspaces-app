import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { adminStyles as styles } from "./adminStyles";

type AuditLogRecord = {
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
  created_at: string | null;
};

export function AdminAuditLogsScreen() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<AuditLogRecord[]>("/api/admin/audit-logs", { method: "GET" }, token)
      .then(setLogs)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load audit logs"))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Audit Logs</Text>
      <Text style={styles.subtitle}>
        Track platform role changes, impersonation, approvals, and settings updates.
      </Text>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.list}>
        {logs.length === 0 && !loading ? <Text style={styles.mutedText}>No audit entries.</Text> : null}
        {logs.map((log) => (
          <View key={log.public_id} style={styles.card}>
            <Text style={styles.cardTitle}>{log.action_label || log.action.replace(/[._]/g, " ")}</Text>
            <Text style={styles.mutedText}>
              {log.entity_type} • {log.entity_label || log.entity_public_id}
            </Text>
            <Text style={styles.mutedText}>
              {log.actor_name || log.actor_email || "System"}
              {log.acting_as_email ? ` (as ${log.acting_as_name || log.acting_as_email})` : ""}
              {log.created_at ? ` • ${new Date(log.created_at).toLocaleString()}` : ""}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
