import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";

type CalendarEvent = {
  kind: "booking" | "request" | "subscription";
  public_id: string;
  space_public_id: string;
  space_name: string | null;
  space_type: string;
  location_public_id: string;
  location_name: string;
  start: string;
  end: string;
  status: string;
  payment_status: string | null;
  member: {
    public_id: string;
    name: string;
    email: string;
  };
  amount_cents: number | null;
  checked_in: boolean | null;
  no_show: boolean | null;
  request_kind: string | null;
  plan_name: string | null;
};

type CalendarSpace = {
  public_id: string;
  name: string | null;
  space_type: string;
  location_public_id: string;
  location_name: string;
  location_timezone: string | null;
};

type CalendarResponse = {
  start: string;
  end: string;
  events: CalendarEvent[];
  spaces: CalendarSpace[];
  truncated: boolean;
};

type LocationOption = {
  public_id: string;
  name: string;
};

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

function mergeLocations(current: LocationOption[], spaces: CalendarSpace[]): LocationOption[] {
  const merged = new Map(current.map((location) => [location.public_id, location]));
  for (const space of spaces) {
    if (!merged.has(space.location_public_id)) {
      merged.set(space.location_public_id, {
        public_id: space.location_public_id,
        name: space.location_name,
      });
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTime(iso: string, timezone: string | null | undefined): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone || undefined,
  }).format(new Date(iso));
}

function titleize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function eventTone(status: string) {
  if (status.startsWith("booking.confirmed")) return styles.confirmed;
  if (status.startsWith("booking.pending")) return styles.pending;
  if (status.startsWith("request.payment_failed")) return styles.failed;
  if (status.startsWith("request.")) return styles.requested;
  if (status.startsWith("subscription.")) return styles.subscription;
  return styles.defaultTone;
}

function eventAccent(status: string) {
  if (status.startsWith("booking.confirmed")) return styles.confirmedAccent;
  if (status.startsWith("booking.pending")) return styles.pendingAccent;
  if (status.startsWith("request.payment_failed")) return styles.failedAccent;
  if (status.startsWith("request.")) return styles.requestedAccent;
  if (status.startsWith("subscription.")) return styles.subscriptionAccent;
  return styles.defaultAccent;
}

export function MemberCalendarScreen() {
  const { token } = useAuth();
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [locationPublicId, setLocationPublicId] = useState("");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const spacesById = useMemo(
    () => new Map((data?.spaces || []).map((space) => [space.public_id, space])),
    [data?.spaces]
  );

  const events = useMemo(
    () =>
      [...(data?.events || [])].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
      ),
    [data?.events]
  );

  const load = useCallback(async () => {
    if (!token) return;
    const windowStart = startOfDay(anchor);
    const windowEnd = addDays(windowStart, 1);
    const params = new URLSearchParams();
    params.set("start", windowStart.toISOString());
    params.set("end", windowEnd.toISOString());
    if (locationPublicId) params.set("location_public_id", locationPublicId);

    setLoading(true);
    setMessage("");
    try {
      const response = await apiFetch<CalendarResponse>(
        `/api/me/calendar?${params.toString()}`,
        { method: "GET" },
        token
      );
      setData(response);
      setLocations((current) => mergeLocations(current, response.spaces));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [anchor, locationPublicId, token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>My Calendar</Text>
          <Text style={styles.subtitle}>Your bookings across every coworking space you use.</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={load}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.dateRow}>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setAnchor((current) => addDays(current, -1))}
          accessibilityLabel="Previous day"
        >
          <Text style={styles.dateButtonText}>Prev</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.datePill}
          onPress={() => setAnchor(startOfDay(new Date()))}
          accessibilityLabel="Today"
        >
          <Text style={styles.dateLabel}>{formatDate(anchor)}</Text>
          <Text style={styles.dateHint}>Tap for today</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setAnchor((current) => addDays(current, 1))}
          accessibilityLabel="Next day"
        >
          <Text style={styles.dateButtonText}>Next</Text>
        </TouchableOpacity>
      </View>

      {locations.length > 0 ? (
        <View style={styles.filterBlock}>
          <Text style={styles.filterLabel}>Location</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <TouchableOpacity
              testID="mobile-calendar-location-all"
              style={[styles.filterChip, !locationPublicId && styles.filterChipActive]}
              onPress={() => setLocationPublicId("")}
            >
              <Text style={[styles.filterText, !locationPublicId && styles.filterTextActive]}>All</Text>
            </TouchableOpacity>
            {locations.map((location) => {
              const active = locationPublicId === location.public_id;
              return (
                <TouchableOpacity
                  key={location.public_id}
                  testID={`mobile-calendar-location-${location.public_id}`}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setLocationPublicId(location.public_id)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{location.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {loading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.schedule}>
        {events.length === 0 && !loading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No bookings this day</Text>
            <Text style={styles.emptyText}>Try another date or clear the location filter.</Text>
          </View>
        ) : (
          events.map((event) => {
            const space = spacesById.get(event.space_public_id);
            const timezone = space?.location_timezone;
            return (
              <TouchableOpacity
                key={`${event.kind}-${event.public_id}`}
                testID={`mobile-calendar-event-${event.public_id}`}
                style={[styles.eventCard, eventTone(event.status)]}
              >
                <View style={[styles.eventAccent, eventAccent(event.status)]} />
                <View style={styles.eventBody}>
                  <Text style={styles.eventTime}>
                    {formatTime(event.start, timezone)} - {formatTime(event.end, timezone)}
                  </Text>
                  <Text style={styles.eventTitle}>{event.space_name || titleize(event.space_type)}</Text>
                  <Text style={styles.eventMeta}>{event.location_name}</Text>
                  <View style={styles.statusRow}>
                    <Text style={styles.statusText}>{titleize(event.status.replace(".", " "))}</Text>
                    {event.payment_status ? (
                      <Text style={styles.statusText}>{titleize(event.payment_status)}</Text>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280",
    maxWidth: 260,
  },
  refreshButton: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  refreshText: {
    fontSize: 12,
    color: "#111827",
    fontWeight: "600",
  },
  dateRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
  },
  dateButtonText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 13,
  },
  datePill: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  dateLabel: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 14,
  },
  dateHint: {
    marginTop: 2,
    color: "#6B7280",
    fontSize: 11,
  },
  filterBlock: {
    marginTop: 18,
  },
  filterLabel: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  filterRow: {
    gap: 8,
    paddingTop: 8,
    paddingRight: 24,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
  },
  filterChipActive: {
    backgroundColor: "#4F46E5",
    borderColor: "#4F46E5",
  },
  filterText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "600",
  },
  filterTextActive: {
    color: "#FFFFFF",
  },
  message: {
    marginTop: 12,
    color: "#DC2626",
    fontSize: 12,
  },
  schedule: {
    marginTop: 18,
    gap: 12,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
  },
  emptyTitle: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 14,
  },
  emptyText: {
    marginTop: 4,
    color: "#6B7280",
    fontSize: 12,
  },
  eventCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
  },
  eventAccent: {
    width: 5,
  },
  eventBody: {
    flex: 1,
    padding: 14,
  },
  eventTime: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 13,
  },
  eventTitle: {
    marginTop: 6,
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },
  eventMeta: {
    marginTop: 4,
    color: "#4B5563",
    fontSize: 12,
  },
  statusRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusText: {
    color: "#374151",
    fontSize: 11,
    fontWeight: "600",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  confirmed: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  confirmedAccent: {
    backgroundColor: "#059669",
  },
  pending: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
  },
  pendingAccent: {
    backgroundColor: "#D97706",
  },
  requested: {
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
  },
  requestedAccent: {
    backgroundColor: "#2563EB",
  },
  failed: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
  },
  failedAccent: {
    backgroundColor: "#DC2626",
  },
  subscription: {
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
  },
  subscriptionAccent: {
    backgroundColor: "#4F46E5",
  },
  defaultTone: {
    backgroundColor: "#F9FAFB",
    borderColor: "#D1D5DB",
  },
  defaultAccent: {
    backgroundColor: "#6B7280",
  },
});
