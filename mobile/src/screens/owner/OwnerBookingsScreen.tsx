import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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
  operator_notes?: string | null;
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
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [confirmingReject, setConfirmingReject] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<BookingRequest[]>("/api/booking-requests", { method: "GET" }, token)
      .then((rows) => {
        const pending = rows.filter((row) => row.status === "requested" || row.status === "payment_failed");
        setBookings(pending);
        setNotes(Object.fromEntries(pending.map((row) => [row.public_id, row.operator_notes || ""])));
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load booking requests"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(publicId: string, action: "approve" | "reject") {
    if (!token) return;
    setUpdating(publicId);
    setConfirmingReject(null);
    setMessage("");
    try {
      await apiFetch(
        `/api/booking-requests/${publicId}/${action}`,
        {
          method: "POST",
          body: JSON.stringify({ operator_notes: notes[publicId] || null }),
        },
        token,
      );
      setMessage(action === "approve" ? "Request approved" : "Request rejected");
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to update booking request");
    } finally {
      setUpdating(null);
    }
  }

  const isSuccess = message === "Request approved" || message === "Request rejected";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
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
      {message ? <Text style={isSuccess ? styles.successMessage : styles.message}>{message}</Text> : null}
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
              {booking.status === "requested" ? (
                <View style={styles.decisionArea}>
                  <TextInput
                    accessibilityLabel={`Operator notes for ${booking.public_id}`}
                    style={styles.notesInput}
                    placeholder="Add notes for the member or your internal team"
                    placeholderTextColor="#9CA3AF"
                    value={notes[booking.public_id] || ""}
                    onChangeText={(value) => setNotes((prev) => ({ ...prev, [booking.public_id]: value }))}
                  />
                  {confirmingReject === booking.public_id ? (
                    <View style={styles.decisionRow}>
                      <Text style={styles.confirmText}>Reject this request?</Text>
                      <TouchableOpacity
                        style={styles.rejectButton}
                        onPress={() => decide(booking.public_id, "reject")}
                        disabled={updating === booking.public_id}
                        accessibilityRole="button"
                        accessibilityLabel={`Confirm reject ${booking.public_id}`}
                      >
                        <Text style={styles.rejectButtonText}>Confirm reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={() => setConfirmingReject(null)}
                        accessibilityRole="button"
                        accessibilityLabel={`Cancel reject ${booking.public_id}`}
                      >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.decisionRow}>
                      <TouchableOpacity
                        style={styles.approveButton}
                        onPress={() => decide(booking.public_id, "approve")}
                        disabled={updating === booking.public_id}
                        accessibilityRole="button"
                        accessibilityLabel={`Approve ${booking.public_id}`}
                      >
                        {updating === booking.public_id ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text style={styles.approveButtonText}>Approve</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={() => setConfirmingReject(booking.public_id)}
                        disabled={updating === booking.public_id}
                        accessibilityRole="button"
                        accessibilityLabel={`Reject ${booking.public_id}`}
                      >
                        <Text style={styles.cancelButtonText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : null}
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1
  },
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
  successMessage: {
    marginTop: 12,
    color: "#047857",
    fontSize: 12,
    fontWeight: "700"
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
  },
  decisionArea: {
    marginTop: 10,
    gap: 8
  },
  notesInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: "#111827",
    backgroundColor: "#FFFFFF"
  },
  decisionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  confirmText: {
    fontSize: 12,
    color: "#991B1B",
    fontWeight: "700"
  },
  approveButton: {
    borderRadius: 10,
    backgroundColor: "#047857",
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center"
  },
  approveButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700"
  },
  rejectButton: {
    borderRadius: 10,
    backgroundColor: "#DC2626",
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  rejectButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700"
  },
  cancelButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF"
  },
  cancelButtonText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "700"
  }
});
