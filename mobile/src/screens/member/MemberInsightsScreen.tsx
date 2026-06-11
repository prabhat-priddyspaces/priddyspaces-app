import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Summary = {
  totals: {
    visits: number;
    hours: number;
    spent: number;
    upcoming: number;
    past: number;
  };
  favourite_space: {
    space_public_id: string | null;
    space_name: string | null;
    location_name: string | null;
  };
  usual: { day_of_week: number | null; hour: number | null };
  upcoming: Array<{ public_id: string; start_datetime: string; end_datetime: string }>;
  visit_series: Array<{ bucket: string; visits: number }>;
};

const DAY_LABEL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatCents(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 100 === 0 ? 0 : 2,
  }).format(value / 100);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function MemberInsightsScreen() {
  const { token } = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<Summary>("/api/analytics/me/summary", { method: "GET" }, token);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load insights");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const maxVisits = Math.max(1, ...(data?.visit_series || []).map((entry) => entry.visits));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Your insights</Text>
      <Text style={styles.subtitle}>Your workspace activity at a glance.</Text>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {error ? <Text style={styles.message}>{error}</Text> : null}

      {data ? (
        <>
          <View style={styles.statsRow}>
            <Stat label="Total visits" value={formatNumber(data.totals.visits)} />
            <Stat label="Hours booked" value={`${data.totals.hours}h`} />
            <Stat label="Total spent" value={formatCents(data.totals.spent)} />
            <Stat label="Upcoming / past" value={`${data.totals.upcoming} / ${data.totals.past}`} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Favourite space</Text>
            <Text style={styles.bigText}>{data.favourite_space.space_name || "—"}</Text>
            <Text style={styles.mutedText}>
              {data.favourite_space.location_name || "No completed bookings yet"}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your usual</Text>
            <Text style={styles.bigText}>
              {data.usual.day_of_week !== null ? `${DAY_LABEL[data.usual.day_of_week]}s` : "—"}
              {data.usual.hour !== null ? ` · ${data.usual.hour.toString().padStart(2, "0")}:00` : ""}
            </Text>
            <Text style={styles.mutedText}>Most frequent day/time</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Visits (last 12 weeks)</Text>
            {data.visit_series.length === 0 ? (
              <Text style={styles.mutedText}>No visits yet.</Text>
            ) : (
              data.visit_series.map((entry) => (
                <View key={entry.bucket} style={styles.barRow}>
                  <Text style={styles.barLabel}>{entry.bucket}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${(entry.visits / maxVisits) * 100}%` }]} />
                  </View>
                  <Text style={styles.barValue}>{entry.visits}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming bookings ({data.upcoming.length})</Text>
            {data.upcoming.length === 0 ? (
              <Text style={styles.mutedText}>No upcoming bookings.</Text>
            ) : (
              data.upcoming.map((booking) => (
                <View key={booking.public_id} style={styles.upcomingRow}>
                  <Text style={styles.upcomingText}>
                    {booking.start_datetime.slice(0, 16).replace("T", " ")} →{" "}
                    {booking.end_datetime.slice(0, 16).replace("T", " ")}
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.mutedText}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
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
    gap: 14
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
    minWidth: 140,
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
  bigText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827"
  },
  mutedText: {
    fontSize: 12,
    color: "#6B7280"
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  barLabel: {
    width: 78,
    fontSize: 11,
    color: "#6B7280"
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    overflow: "hidden"
  },
  barFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#4F46E5"
  },
  barValue: {
    width: 28,
    textAlign: "right",
    fontSize: 11,
    color: "#374151",
    fontWeight: "700"
  },
  upcomingRow: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10
  },
  upcomingText: {
    fontSize: 13,
    color: "#111827"
  },
  message: {
    color: "#DC2626",
    fontSize: 12
  }
});
