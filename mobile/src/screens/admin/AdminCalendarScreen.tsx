import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { adminStyles as styles } from "./adminStyles";

type CalendarEvent = {
  kind: string;
  public_id: string;
  space_name: string | null;
  space_type: string;
  location_name: string;
  start: string;
  end: string;
  status: string;
  member: { public_id: string; name: string; email: string } | null;
};

type CalendarResponse = { events: CalendarEvent[] };

type Company = { public_id: string; name: string };

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function AdminCalendarScreen() {
  const { token } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [orgId, setOrgId] = useState("");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch<Company[]>("/api/admin/owner-companies", { method: "GET" }, token)
      .then((list) => setCompanies(list.map((c: any) => ({ public_id: c.public_id, name: c.display_name || c.name }))))
      .catch(() => setCompanies([]));
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    const windowStart = startOfDay(anchor);
    const windowEnd = addDays(windowStart, 1);
    const params = new URLSearchParams();
    params.set("start", windowStart.toISOString());
    params.set("end", windowEnd.toISOString());
    if (orgId) params.set("organization_public_id", orgId);
    params.set("include", "bookings,requests,subscriptions");
    setLoading(true);
    setMessage("");
    try {
      const response = await apiFetch<CalendarResponse>(
        `/api/admin/calendar?${params.toString()}`,
        { method: "GET" },
        token,
      );
      setEvents(
        [...response.events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [token, anchor, orgId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Platform calendar</Text>
      <Text style={styles.subtitle}>Bookings across all owners, filterable by company.</Text>

      <View style={local.dateRow}>
        <TouchableOpacity
          style={local.dateButton}
          onPress={() => setAnchor((current) => addDays(current, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
        >
          <Text style={local.dateButtonText}>Prev</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={local.datePill}
          onPress={() => setAnchor(startOfDay(new Date()))}
          accessibilityRole="button"
          accessibilityLabel="Today"
        >
          <Text style={local.dateLabel}>
            {new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(anchor)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={local.dateButton}
          onPress={() => setAnchor((current) => addDays(current, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next day"
        >
          <Text style={local.dateButtonText}>Next</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <TouchableOpacity
          style={[local.chip, !orgId && local.chipActive]}
          onPress={() => setOrgId("")}
          accessibilityRole="button"
          accessibilityLabel="All companies"
        >
          <Text style={[local.chipText, !orgId && local.chipTextActive]}>All companies</Text>
        </TouchableOpacity>
        {companies.map((company) => (
          <TouchableOpacity
            key={company.public_id}
            style={[local.chip, orgId === company.public_id && local.chipActive]}
            onPress={() => setOrgId(company.public_id)}
            accessibilityRole="button"
            accessibilityLabel={`Company ${company.name}`}
          >
            <Text style={[local.chipText, orgId === company.public_id && local.chipTextActive]}>
              {company.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.list}>
        {events.length === 0 && !loading ? (
          <Text style={styles.mutedText}>No events this day.</Text>
        ) : (
          events.map((event) => (
            <View key={`${event.kind}-${event.public_id}`} style={styles.card}>
              <Text style={styles.cardTitle}>{event.space_name || event.space_type}</Text>
              <Text style={styles.mutedText}>
                {new Date(event.start).toLocaleTimeString()} - {new Date(event.end).toLocaleTimeString()} •{" "}
                {event.location_name}
              </Text>
              <Text style={styles.mutedText}>
                {event.member?.name || event.member?.email || "Member"} • {event.status}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const local = StyleSheet.create({
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  dateButton: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF"
  },
  dateButtonText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 13
  },
  datePill: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center"
  },
  dateLabel: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 14
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
    fontWeight: "700"
  },
  chipTextActive: {
    color: "#3730A3"
  }
});
