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

type EmailDeliverySummary = {
  notification_type: string;
  label: string;
  status: string;
  recipient_count: number;
  last_error: string | null;
  recipients: string[];
};

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
  email_delivery_summary?: EmailDeliverySummary[];
};

type WaitlistEntry = {
  public_id: string;
  status: string;
  member_name: string | null;
  member_email: string | null;
  membership_plan_name: string | null;
  space_name: string | null;
  space_type: string;
  location_name: string | null;
  desired_start_date: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  invite_expires_at: string | null;
  operator_notes: string | null;
};

type StatusFilter = "all" | "requested" | "approved" | "payment_failed" | "rejected" | "cancelled";

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "requested", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "payment_failed", label: "Payment failed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

function approvalModeLabel(request: BookingRequest) {
  const mode = request.booking_approval_mode === "auto" ? "auto approve" : "manual approval";
  if (request.request_kind === "membership_purchase" || request.request_kind === "lease_purchase") {
    return `Membership & lease ${mode}`;
  }
  return `Hourly/day-pass ${mode}`;
}

function emailStatusLabel(status: string): string {
  switch (status) {
    case "not_sent":
      return "Not sent";
    case "sent":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "opened":
      return "Opened";
    case "clicked":
      return "Clicked";
    case "bounced":
      return "Bounced";
    case "failed":
      return "Failed";
    case "queued":
      return "Queued";
    default:
      return status || "Unknown";
  }
}

function canResendEmail(status: string): boolean {
  return status === "failed" || status === "bounced" || status === "not_sent";
}

const SUCCESS_MESSAGES = new Set([
  "Request approved",
  "Request rejected",
  "Waitlist invite sent",
  "Email resent",
]);

export function OwnerBookingsScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [confirmingReject, setConfirmingReject] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      apiFetch<BookingRequest[]>("/api/booking-requests", { method: "GET" }, token),
      apiFetch<WaitlistEntry[]>("/api/booking-waitlist", { method: "GET" }, token).catch(() => []),
    ])
      .then(([rows, waitlistRows]) => {
        setBookings(rows);
        setWaitlist(waitlistRows);
        setNotes(
          Object.fromEntries([
            ...rows.map((row) => [row.public_id, row.operator_notes || ""] as const),
            ...waitlistRows.map((entry) => [entry.public_id, entry.operator_notes || ""] as const),
          ]),
        );
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

  async function inviteWaitlist(publicId: string) {
    if (!token) return;
    setUpdating(publicId);
    setMessage("");
    try {
      await apiFetch(
        `/api/booking-waitlist/${publicId}/invite`,
        {
          method: "POST",
          body: JSON.stringify({ operator_notes: notes[publicId] || null }),
        },
        token,
      );
      setMessage("Waitlist invite sent");
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to invite waitlisted member");
    } finally {
      setUpdating(null);
    }
  }

  async function resendEmail(publicId: string, notificationType: string) {
    if (!token) return;
    const key = `${publicId}:${notificationType}`;
    setResending(key);
    setMessage("");
    try {
      await apiFetch(
        `/api/booking-requests/${publicId}/emails/resend`,
        {
          method: "POST",
          body: JSON.stringify({ notification_type: notificationType }),
        },
        token,
      );
      setMessage("Email resent");
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Resend failed");
    } finally {
      setResending(null);
    }
  }

  const filtered = filter === "all" ? bookings : bookings.filter((b) => b.status === filter);
  const isSuccess = SUCCESS_MESSAGES.has(message);

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

      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((option) => {
          const active = filter === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilter(option.value)}
              accessibilityRole="button"
              accessibilityLabel={`Filter ${option.label}`}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={isSuccess ? styles.successMessage : styles.message}>{message}</Text> : null}

      {waitlist.length > 0 ? (
        <View style={styles.waitlistSection}>
          <Text style={styles.sectionTitle}>Waitlist</Text>
          {waitlist.map((entry) => {
            const member = entry.member_name || entry.member_email || "Member";
            const space = entry.membership_plan_name || entry.space_name || entry.space_type || "Space";
            const when = entry.desired_start_date
              ? `Desired start ${entry.desired_start_date}`
              : entry.start_datetime || "Requested time";
            const open = entry.status === "waitlisted" || entry.status === "invited";
            return (
              <View key={entry.public_id} style={styles.card}>
                <Text style={styles.cardTitle}>{member}</Text>
                <Text style={styles.cardMuted}>{entry.member_email || "No email"}</Text>
                <Text style={styles.cardSubtitle}>
                  {space}
                  {entry.location_name ? ` • ${entry.location_name}` : ""}
                </Text>
                <Text style={styles.cardMuted}>{when}</Text>
                <Text style={styles.cardMuted}>
                  {entry.status === "waitlisted" ? "Waitlisted" : entry.status}
                  {entry.invite_expires_at ? ` • Invite expires ${entry.invite_expires_at}` : ""}
                </Text>
                <TextInput
                  accessibilityLabel={`Operator notes for ${entry.public_id}`}
                  style={styles.notesInput}
                  placeholder="Add invite context"
                  placeholderTextColor="#9CA3AF"
                  value={notes[entry.public_id] || ""}
                  onChangeText={(value) => setNotes((prev) => ({ ...prev, [entry.public_id]: value }))}
                />
                {open ? (
                  <TouchableOpacity
                    style={styles.approveButton}
                    onPress={() => inviteWaitlist(entry.public_id)}
                    disabled={updating === entry.public_id}
                    accessibilityRole="button"
                    accessibilityLabel={`Invite ${entry.public_id}`}
                  >
                    {updating === entry.public_id ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.approveButtonText}>Invite to book</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.cardMuted}>Closed</Text>
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={styles.list}>
        {filtered.length === 0 && !loading ? (
          <Text style={styles.empty}>
            {bookings.length === 0
              ? "No booking requests are waiting for review."
              : "No booking requests match this filter."}
          </Text>
        ) : (
          filtered.map((booking) => (
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
              {(booking.email_delivery_summary || []).map((summary) => {
                const resendKey = `${booking.public_id}:${summary.notification_type}`;
                const recipients =
                  summary.recipients.length > 0
                    ? summary.recipients.join(", ")
                    : summary.recipient_count > 0
                      ? `${summary.recipient_count} recipient${summary.recipient_count === 1 ? "" : "s"}`
                      : "No recipient recorded";
                return (
                  <View key={summary.notification_type} style={styles.emailRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.emailLabel}>{summary.label}</Text>
                      <Text style={styles.cardMuted}>{recipients}</Text>
                      <Text style={styles.cardMuted}>{emailStatusLabel(summary.status)}</Text>
                      {summary.last_error ? (
                        <Text style={styles.cardWarning}>{summary.last_error}</Text>
                      ) : null}
                    </View>
                    {canResendEmail(summary.status) ? (
                      <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={() => resendEmail(booking.public_id, summary.notification_type)}
                        disabled={resending === resendKey}
                        accessibilityRole="button"
                        accessibilityLabel={`Resend ${summary.notification_type} for ${booking.public_id}`}
                      >
                        <Text style={styles.cancelButtonText}>
                          {resending === resendKey ? "Resending..." : "Resend"}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
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
  filterRow: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  filterChip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#FFFFFF"
  },
  filterChipActive: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF"
  },
  filterText: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "700"
  },
  filterTextActive: {
    color: "#3730A3"
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
  waitlistSection: {
    marginTop: 16,
    gap: 10
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
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
  emailRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10
  },
  emailLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827"
  },
  decisionArea: {
    marginTop: 10,
    gap: 8
  },
  notesInput: {
    marginTop: 8,
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
    marginTop: 4,
    alignSelf: "flex-start",
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
