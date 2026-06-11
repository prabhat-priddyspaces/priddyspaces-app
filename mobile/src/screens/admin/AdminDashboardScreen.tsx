import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type DashboardResponse = {
  metrics: Record<string, number>;
  recent_activity: Array<{
    public_id: string;
    action: string;
    action_label?: string;
    entity_type: string;
    entity_public_id: string;
    entity_label?: string;
    actor_name: string | null;
    actor_email: string | null;
    created_at: string | null;
  }>;
};

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const METRICS: Array<{ key: string; label: string; currency?: boolean; sub?: string }> = [
  { key: "users", label: "Users" },
  { key: "members", label: "Members" },
  { key: "owner_companies", label: "Owner companies" },
  { key: "live_listings", label: "Live listings" },
  { key: "bookings", label: "Bookings" },
  { key: "booking_requests", label: "Pending requests" },
  { key: "gmv", label: "GMV", currency: true },
  { key: "platform_earnings", label: "Platform earnings", currency: true, sub: "Net of host payouts" },
];

function formatAdminLabel(value: string) {
  return value.replace(/[._]/g, " ");
}

export function AdminDashboardScreen() {
  const { token } = useAuth();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<DashboardResponse>("/api/admin/dashboard", { method: "GET" }, token)
      .then(setData)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [token]);

  const cards = useMemo(() => {
    const metrics = data?.metrics ?? {};
    return METRICS.map((spec) => ({
      ...spec,
      value: spec.currency
        ? currencyFormatter.format(metrics[spec.key] ?? 0)
        : numberFormatter.format(metrics[spec.key] ?? 0),
    }));
  }, [data]);

  const activity = data?.recent_activity ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Platform dashboard</Text>
      <Text style={styles.subtitle}>Users, inventory, bookings, and earnings across all owners.</Text>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.statsRow}>
        {cards.map((card) => (
          <View key={card.key} style={styles.statCard}>
            <Text style={styles.mutedText}>{card.label}</Text>
            <Text style={styles.statValue}>{card.value}</Text>
            {card.sub ? <Text style={styles.mutedText}>{card.sub}</Text> : null}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent activity</Text>
        {activity.length === 0 && !loading ? (
          <Text style={styles.mutedText}>No recent activity yet.</Text>
        ) : (
          activity.map((item) => (
            <View key={item.public_id} style={styles.listRow}>
              <Text style={styles.listTitle}>
                {item.action_label || formatAdminLabel(item.action)}
              </Text>
              <Text style={styles.mutedText}>
                {item.entity_type} • {item.entity_label || item.entity_public_id}
              </Text>
              <Text style={styles.mutedText}>
                {item.actor_name || item.actor_email || "System"}
                {item.created_at ? ` • ${new Date(item.created_at).toLocaleString()}` : ""}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F9FAFB"
  },
  container: {
    padding: 20,
    gap: 12
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827"
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#6B7280"
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  statCard: {
    flexGrow: 1,
    minWidth: 150,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    gap: 4
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827"
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 8
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  listRow: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    gap: 3
  },
  listTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    textTransform: "capitalize"
  },
  mutedText: {
    fontSize: 12,
    color: "#6B7280"
  },
  message: {
    color: "#DC2626",
    fontSize: 12
  }
});
