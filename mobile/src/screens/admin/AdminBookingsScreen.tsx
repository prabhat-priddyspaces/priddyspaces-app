import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { adminStyles as styles } from "./adminStyles";

type ActivityRecord = {
  public_id: string;
  status: string;
  member_name: string | null;
  member_email: string | null;
  space_name: string | null;
  space_type: string | null;
  location_name: string | null;
  organization_name: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
};

type BookingActivityResponse = {
  bookings: ActivityRecord[];
  booking_requests: Array<ActivityRecord & { operator_notes: string | null }>;
};

function personLabel(item: ActivityRecord) {
  return item.member_name || item.member_email || "Guest";
}

function inventoryLabel(item: ActivityRecord) {
  return [item.organization_name, item.location_name, item.space_name || item.space_type]
    .filter(Boolean)
    .join(" / ");
}

function timeWindowLabel(item: ActivityRecord) {
  if (!item.start_datetime && !item.end_datetime) return "No booking window";
  const start = item.start_datetime ? new Date(item.start_datetime).toLocaleString() : "—";
  const end = item.end_datetime ? new Date(item.end_datetime).toLocaleString() : "—";
  return `${start} to ${end}`;
}

export function AdminBookingsScreen() {
  const { token } = useAuth();
  const [data, setData] = useState<BookingActivityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<BookingActivityResponse>("/api/admin/bookings", { method: "GET" }, token)
      .then(setData)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load bookings"))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Bookings</Text>
      <Text style={styles.subtitle}>All confirmed bookings and requests across the platform.</Text>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Text style={styles.sectionTitle}>Booking requests ({data?.booking_requests.length ?? 0})</Text>
      <View style={styles.list}>
        {(data?.booking_requests ?? []).map((item) => (
          <View key={item.public_id} style={styles.card}>
            <Text style={styles.cardTitle}>
              {personLabel(item)} • {item.status}
            </Text>
            <Text style={styles.mutedText}>{inventoryLabel(item)}</Text>
            <Text style={styles.mutedText}>{timeWindowLabel(item)}</Text>
            {item.operator_notes ? <Text style={styles.mutedText}>{item.operator_notes}</Text> : null}
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Bookings ({data?.bookings.length ?? 0})</Text>
      <View style={styles.list}>
        {(data?.bookings ?? []).map((item) => (
          <View key={item.public_id} style={styles.card}>
            <Text style={styles.cardTitle}>
              {personLabel(item)} • {item.status}
            </Text>
            <Text style={styles.mutedText}>{inventoryLabel(item)}</Text>
            <Text style={styles.mutedText}>{timeWindowLabel(item)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
