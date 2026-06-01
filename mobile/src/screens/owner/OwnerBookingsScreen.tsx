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
  payment_hold_expires_at?: string | null;
  booking_approval_mode?: string | null;
  membership_lease_approval_mode?: string | null;
  request_kind?: string | null;
  failure_reason?: string | null;
};

function approvalModeLabel(request: BookingRequest) {
  const mode = request.booking_approval_mode === "auto" ? "auto approve" : "manual approval";
  if (request.request_kind === "membership_purchase" || request.request_kind === "lease_purchase") {
    return `Membership & lease ${mode}`;
  }
  return `Hourly/day-pass ${mode}`;
}

export function OwnerBookingsScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<BookingRequest[]>("/api/booking-requests", { method: "GET" }, token)
      .then((rows) => setBookings(rows.filter((row) => row.status === "requested" || row.status === "payment_failed")))
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load booking requests"))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Booking Requests</Text>
          <Text style={styles.subtitle}>Approve booking requests or follow up on failed payment holds.</Text>
        </View>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => navigation.navigate("OwnerCreateBooking")}
          accessibilityRole="button"
          accessibilityLabel="Create booking"
        >
          <Text style={styles.createButtonText}>Create</Text>
        </TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.list}>
        {bookings.length === 0 && !loading ? (
          <Text style={styles.empty}>No pending booking requests.</Text>
        ) : (
          bookings.map((booking) => (
            <TouchableOpacity
              key={booking.public_id}
              style={styles.card}
              onPress={() => navigation.navigate("BookingDetail", { bookingId: booking.public_id })}
            >
              <Text style={styles.cardTitle}>{booking.status}</Text>
              {booking.booking_approval_mode ? (
                <Text style={styles.cardMuted}>{approvalModeLabel(booking)}</Text>
              ) : null}
              <Text style={styles.cardSubtitle}>{booking.start_datetime}</Text>
              <Text style={styles.cardMuted}>{booking.end_datetime}</Text>
              {booking.status === "payment_failed" ? (
                <Text style={styles.cardWarning}>
                  {booking.payment_hold_expires_at
                    ? `Waiting for member payment update until ${new Date(booking.payment_hold_expires_at).toLocaleString()}`
                    : "Waiting for member payment update"}
                </Text>
              ) : null}
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
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
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
  cardWarning: {
    marginTop: 8,
    fontSize: 12,
    color: "#991B1B"
  },
  empty: {
    fontSize: 12,
    color: "#6B7280"
  },
  createButton: {
    borderRadius: 10,
    backgroundColor: "#4F46E5",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  createButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700"
  }
});
