import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { sanitizePhone } from "../../lib/phone";

type MemberStats = {
  total_bookings: number;
  confirmed_bookings: number;
  canceled_bookings: number;
  no_shows: number;
  open_requests: number;
  total_revenue_cents: number;
  active_subscriptions: number;
  first_booking_at: string | null;
  last_booking_at: string | null;
};

type MemberDetail = {
  user_public_id: string;
  organization_public_id: string;
  name: string;
  email: string;
  status: string;
  phone: string | null;
  company_name: string | null;
  tags: string[];
  notes: string | null;
  stats: MemberStats;
};

type CalendarEvent = {
  kind: string;
  public_id: string;
  space_name: string | null;
  space_type: string;
  location_name: string;
  start: string;
  end: string;
  status: string;
  member: { public_id: string; name: string; email: string };
};

type CalendarResponse = { events: CalendarEvent[] };

const MEMBER_STATUSES = ["lead", "active", "churned", "blocked"] as const;

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function OwnerMemberDetailScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { publicId, orgId } = route.params || {};
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [draftStatus, setDraftStatus] = useState<string>("active");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftCompany, setDraftCompany] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token || !publicId || !orgId) return;
    setLoading(true);
    setMessage("");
    try {
      const memberParams = new URLSearchParams({ organization_public_id: orgId });
      const detail = await apiFetch<MemberDetail>(
        `/api/owner/members/${encodeURIComponent(publicId)}?${memberParams.toString()}`,
        { method: "GET" },
        token,
      );
      setMember(detail);
      setDraftStatus(detail.status || "active");
      setDraftPhone(detail.phone || "");
      setDraftCompany(detail.company_name || "");
      setDraftTags(detail.tags.join(", "));
      setDraftNotes(detail.notes || "");

      const now = new Date();
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      const end = new Date(now);
      end.setDate(end.getDate() + 120);
      const params = new URLSearchParams();
      params.set("start", start.toISOString());
      params.set("end", end.toISOString());
      params.set("member_public_id", publicId);
      params.set("organization_public_id", orgId);
      params.set("include", "bookings,requests,subscriptions");
      const calendar = await apiFetch<CalendarResponse>(
        `/api/owner/calendar?${params.toString()}`,
        { method: "GET" },
        token,
      ).catch(() => null);
      setEvents(
        calendar ? calendar.events.filter((event) => event.member?.public_id === publicId) : [],
      );
    } catch (err) {
      setMember(null);
      setMessage(err instanceof Error ? err.message : "Failed to load member");
    } finally {
      setLoading(false);
    }
  }, [token, publicId, orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return {
      upcoming: sorted.filter((event) => new Date(event.end).getTime() >= now),
      past: sorted.filter((event) => new Date(event.end).getTime() < now).reverse(),
    };
  }, [events]);

  async function save() {
    if (!token || !orgId || !publicId) return;
    setSaving(true);
    setMessage("");
    try {
      const memberParams = new URLSearchParams({ organization_public_id: orgId });
      const tags = draftTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const updated = await apiFetch<MemberDetail>(
        `/api/owner/members/${encodeURIComponent(publicId)}?${memberParams.toString()}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: draftStatus,
            phone: draftPhone,
            company_name: draftCompany,
            tags,
            notes: draftNotes,
          }),
        },
        token,
      );
      setMember(updated);
      setMessage("Saved");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const statRows = member
    ? [
        ["Total bookings", member.stats.total_bookings.toString()],
        ["Confirmed", member.stats.confirmed_bookings.toString()],
        ["Canceled", member.stats.canceled_bookings.toString()],
        ["No-shows", member.stats.no_shows.toString()],
        ["Open requests", member.stats.open_requests.toString()],
        ["Revenue", formatCents(member.stats.total_revenue_cents)],
        ["Active subscriptions", member.stats.active_subscriptions.toString()],
      ]
    : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? (
        <Text style={message === "Saved" ? styles.successMessage : styles.message}>{message}</Text>
      ) : null}

      {member ? (
        <>
          <Text style={styles.title}>{member.name}</Text>
          <Text style={styles.subtitle}>{member.email}</Text>

          <View style={styles.statsRow}>
            {statRows.map(([label, value]) => (
              <View key={label} style={styles.statCard}>
                <Text style={styles.mutedText}>{label}</Text>
                <Text style={styles.statValue}>{value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.chipRow}>
              {MEMBER_STATUSES.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[styles.chip, draftStatus === status && styles.chipActive]}
                  onPress={() => setDraftStatus(status)}
                  accessibilityRole="button"
                  accessibilityLabel={`Set status ${status}`}
                >
                  <Text style={[styles.chipText, draftStatus === status && styles.chipTextActive]}>
                    {status}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Field
              label="Phone"
              value={draftPhone}
              onChange={(value) => setDraftPhone(sanitizePhone(value))}
            />
            <Field label="Company" value={draftCompany} onChange={setDraftCompany} />
            <Field label="Tags (comma separated)" value={draftTags} onChange={setDraftTags} />
            <View style={styles.field}>
              <Text style={styles.label}>Notes</Text>
              <TextInput
                accessibilityLabel="Notes"
                style={[styles.input, styles.multiline]}
                value={draftNotes}
                onChangeText={setDraftNotes}
                multiline
              />
            </View>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={save}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Save member"
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming ({upcoming.length})</Text>
            {upcoming.length === 0 ? <Text style={styles.mutedText}>No upcoming activity.</Text> : null}
            {upcoming.map((event) => (
              <EventRow key={`${event.kind}-${event.public_id}`} event={event} navigation={navigation} />
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Past ({past.length})</Text>
            {past.length === 0 ? <Text style={styles.mutedText}>No past activity.</Text> : null}
            {past.slice(0, 20).map((event) => (
              <EventRow key={`${event.kind}-${event.public_id}`} event={event} navigation={navigation} />
            ))}
          </View>
        </>
      ) : !loading ? (
        <Text style={styles.mutedText}>Member not found.</Text>
      ) : null}
    </ScrollView>
  );
}

function EventRow({ event, navigation }: { event: CalendarEvent; navigation: any }) {
  const openable = event.kind === "booking" || event.kind === "request";
  return (
    <TouchableOpacity
      style={styles.eventRow}
      disabled={!openable}
      onPress={() => (openable ? navigation.navigate("BookingDetail", { bookingId: event.public_id }) : null)}
      accessibilityLabel={`Open activity ${event.public_id}`}
    >
      <Text style={styles.eventTitle}>{event.space_name || event.space_type}</Text>
      <Text style={styles.mutedText}>
        {new Date(event.start).toLocaleString()} - {new Date(event.end).toLocaleString()}
      </Text>
      <Text style={styles.mutedText}>
        {event.location_name} • {event.status}
      </Text>
    </TouchableOpacity>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} style={styles.input} value={value} onChangeText={onChange} />
    </View>
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
    fontSize: 14,
    color: "#6B7280"
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  statCard: {
    flexGrow: 1,
    minWidth: 105,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 10,
    gap: 4
  },
  statValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 10
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#FFFFFF"
  },
  chipActive: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF"
  },
  chipText: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize"
  },
  chipTextActive: {
    color: "#3730A3"
  },
  field: {
    gap: 5
  },
  label: {
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "700"
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF"
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: "top"
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: "#4F46E5"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700"
  },
  eventRow: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    gap: 3
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827"
  },
  mutedText: {
    fontSize: 12,
    color: "#6B7280"
  },
  message: {
    color: "#DC2626",
    fontSize: 12
  },
  successMessage: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "700"
  }
});
