import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Switch, Text, TouchableOpacity, View, StyleSheet } from "react-native";

import { useAuth } from "../context/AuthContext";
import {
  AppNotification,
  NotificationPreference,
  getNotificationPreferences,
  listNotifications,
  markNotificationRead,
  registerExpoPushToken,
  updateNotificationPreferences,
} from "../lib/notifications";

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function NotificationCard({ row, onRead }: { row: AppNotification; onRead: (row: AppNotification) => void }) {
  return (
    <TouchableOpacity style={[styles.card, !row.is_read && styles.unreadCard]} onPress={() => onRead(row)}>
      <Text style={styles.cardTitle}>{row.title}</Text>
      <Text style={styles.muted}>{row.body}</Text>
      <Text style={styles.timestamp}>{formatDateTime(row.created_at)}</Text>
    </TouchableOpacity>
  );
}

export function NotificationsScreen() {
  const { token, me } = useAuth();
  const [rows, setRows] = useState<AppNotification[]>([]);
  const [prefs, setPrefs] = useState<NotificationPreference | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMessage("");
    try {
      const [notificationList, preferences] = await Promise.all([
        listNotifications(token),
        me?.role === "member" ? getNotificationPreferences(token) : Promise.resolve(null),
      ]);
      setRows(notificationList.results);
      setPrefs(preferences);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [me?.role, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function enablePush() {
    const result = await registerExpoPushToken(token || undefined, true);
    setMessage(result.message);
  }

  async function togglePreference(field: keyof NotificationPreference, value: boolean) {
    if (!token || !prefs) return;
    const next = { ...prefs, [field]: value };
    setPrefs(next);
    try {
      const saved = await updateNotificationPreferences({ [field]: value }, token);
      setPrefs(saved);
      setMessage("Notification settings saved");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save notification settings");
      await load();
    }
  }

  async function onRead(row: AppNotification) {
    if (!token || row.is_read) return;
    setRows((current) => current.map((item) => (item.public_id === row.public_id ? { ...item, is_read: true } : item)));
    try {
      await markNotificationRead(row.public_id, token);
    } catch {
      await load();
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notifications</Text>
      <Text style={styles.subtitle}>Booking reminders and recent alerts.</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Device notifications</Text>
        <Text style={styles.muted}>Enable push alerts on this device for upcoming booking reminders.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={enablePush}>
          <Text style={styles.primaryButtonText}>Enable push</Text>
        </TouchableOpacity>
      </View>
      {prefs ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reminder settings</Text>
          <View style={styles.row}>
            <Text style={styles.value}>Before booking starts</Text>
            <Switch
              testID="booking-start-push-toggle"
              value={prefs.booking_start_push_enabled}
              onValueChange={(value) => togglePreference("booking_start_push_enabled", value)}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.value}>Before meeting-room booking ends</Text>
            <Switch
              testID="booking-end-push-toggle"
              value={prefs.booking_end_push_enabled}
              onValueChange={(value) => togglePreference("booking_end_push_enabled", value)}
            />
          </View>
        </View>
      ) : null}
      {loading && rows.length === 0 ? <ActivityIndicator style={{ marginTop: 14 }} /> : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => item.public_id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        renderItem={({ item }) => <NotificationCard row={item} onRead={onRead} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.muted}>Booking reminders will appear here.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#F9FAFB",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    marginTop: 6,
    color: "#6B7280",
    fontSize: 14,
  },
  message: {
    marginTop: 12,
    color: "#0F766E",
    fontSize: 12,
  },
  card: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  unreadCard: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  muted: {
    marginTop: 5,
    fontSize: 12,
    color: "#6B7280",
  },
  timestamp: {
    marginTop: 8,
    fontSize: 11,
    color: "#6B7280",
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: "#111827",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  row: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  value: {
    flex: 1,
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
  },
  empty: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    padding: 18,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
});
