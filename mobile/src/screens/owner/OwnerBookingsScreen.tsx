import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type BookingRequest = {
  public_id: string;
  start_datetime: string;
  end_datetime: string;
  status: string;
};

export function OwnerBookingsScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<BookingRequest[]>("/api/booking-requests?status=requested", { method: "GET" }, token)
      .then(setBookings)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load bookings"))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Booking Requests</Text>
      <Text style={styles.subtitle}>Approve or reject requests.</Text>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.list}>
        {bookings.length === 0 && !loading ? (
          <Text style={styles.empty}>No bookings yet.</Text>
        ) : (
          bookings.map((booking) => (
            <TouchableOpacity
              key={booking.public_id}
              style={styles.card}
              onPress={() => navigation.navigate("BookingDetail", { bookingId: booking.public_id })}
            >
              <Text style={styles.cardTitle}>{booking.status}</Text>
              <Text style={styles.cardSubtitle}>{booking.start_datetime}</Text>
              <Text style={styles.cardMuted}>{booking.end_datetime}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827"
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280"
  },
  message: {
    marginTop: 12,
    color: "#DC2626",
    fontSize: 12
  },
  list: {
    marginTop: 16,
    gap: 12
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB"
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827"
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "#374151"
  },
  cardMuted: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280"
  },
  empty: {
    fontSize: 12,
    color: "#6B7280"
  }
});
