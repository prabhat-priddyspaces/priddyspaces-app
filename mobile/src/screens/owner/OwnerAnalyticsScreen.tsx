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

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Overview = {
  kpis: {
    revenue: { current: number; previous: number; delta_pct: number | null };
    bookings: { current: number; previous: number; delta_pct: number | null };
    cancellations: { current: number; previous: number };
    avg_booking_value: number;
    active_memberships: number;
    occupancy_pct: number;
    retention_pct: number;
    no_show_rate_pct: number;
    total_spaces: number;
    total_locations: number;
  };
};

type OccupancyResp = {
  rows: Array<{ bucket: string; occupancy_pct: number }>;
};

type RevenuePerSpaceResp = {
  rows: Array<{
    space_public_id: string;
    space_name: string;
    space_type: string;
    location_name: string;
    bookings: number;
    hours_booked: number;
    owner_net: number;
    avg_revenue_per_hour: number;
  }>;
};

type TopMembersResp = {
  rows: Array<{
    user_public_id: string | null;
    email: string | null;
    name: string | null;
    bookings: number;
    spend: number;
    last_booking: string | null;
  }>;
};

type PeakResp = { matrix: number[][] };

const DAY_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatCents(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function deltaLabel(deltaPct: number | null): string | null {
  if (deltaPct == null) return null;
  return `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}% vs. prior period`;
}

export function OwnerAnalyticsScreen() {
  const { token } = useAuth();
  const [startDate, setStartDate] = useState(daysAgoIso(29));
  const [endDate, setEndDate] = useState(todayIso());
  const [overview, setOverview] = useState<Overview | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancyResp | null>(null);
  const [revenuePerSpace, setRevenuePerSpace] = useState<RevenuePerSpaceResp | null>(null);
  const [topMembers, setTopMembers] = useState<TopMembersResp | null>(null);
  const [peak, setPeak] = useState<PeakResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const range = useMemo(() => `start_date=${startDate}&end_date=${endDate}`, [startDate, endDate]);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setMessage("");
    Promise.all([
      apiFetch<Overview>(`/api/analytics/owner/overview?${range}`, { method: "GET" }, token),
      apiFetch<OccupancyResp>(
        `/api/analytics/owner/occupancy?${range}&granularity=day`,
        { method: "GET" },
        token,
      ).catch(() => null),
      apiFetch<RevenuePerSpaceResp>(
        `/api/analytics/owner/revenue-per-space?${range}`,
        { method: "GET" },
        token,
      ).catch(() => null),
      apiFetch<TopMembersResp>(
        `/api/analytics/owner/top-members?${range}&limit=20`,
        { method: "GET" },
        token,
      ).catch(() => null),
      apiFetch<PeakResp>(`/api/analytics/owner/peak-hours?${range}`, { method: "GET" }, token).catch(
        () => null,
      ),
    ])
      .then(([overviewResp, occupancyResp, revenueResp, membersResp, peakResp]) => {
        setOverview(overviewResp);
        setOccupancy(occupancyResp);
        setRevenuePerSpace(revenueResp);
        setTopMembers(membersResp);
        setPeak(peakResp);
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [token, range]);

  useEffect(() => {
    load();
  }, [load]);

  const busiest = useMemo(() => {
    const matrix = peak?.matrix || [];
    const cells: Array<{ day: number; hour: number; count: number }> = [];
    matrix.forEach((row, day) =>
      row.forEach((count, hour) => {
        if (count > 0) cells.push({ day, hour, count });
      }),
    );
    return cells.sort((a, b) => b.count - a.count).slice(0, 5);
  }, [peak]);

  const kpis = overview?.kpis;
  const maxOccupancy = Math.max(1, ...(occupancy?.rows || []).map((row) => row.occupancy_pct));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Analytics</Text>
      <Text style={styles.subtitle}>Revenue, occupancy, and member activity for your locations.</Text>

      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Start date"
          style={[styles.input, styles.rowInput]}
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
        />
        <TextInput
          accessibilityLabel="End date"
          style={[styles.input, styles.rowInput]}
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD"
        />
        <TouchableOpacity
          style={styles.applyButton}
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel="Apply range"
        >
          <Text style={styles.applyButtonText}>Apply</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {kpis ? (
        <View style={styles.statsRow}>
          <Stat
            label="Revenue (owner net)"
            value={formatCents(kpis.revenue.current)}
            sub={deltaLabel(kpis.revenue.delta_pct)}
          />
          <Stat
            label="Bookings"
            value={formatNumber(kpis.bookings.current)}
            sub={deltaLabel(kpis.bookings.delta_pct)}
          />
          <Stat label="Occupancy" value={`${kpis.occupancy_pct}%`} sub="period avg" />
          <Stat
            label="Active members"
            value={formatNumber(kpis.active_memberships)}
            sub={`${kpis.total_locations} locations • ${kpis.total_spaces} spaces`}
          />
          <Stat label="Avg booking value" value={formatCents(kpis.avg_booking_value)} />
          <Stat label="Retention" value={`${kpis.retention_pct}%`} sub="returning vs prior window" />
          <Stat label="No-show rate" value={`${kpis.no_show_rate_pct}%`} sub="confirmed, no check-in" />
          <Stat label="Cancellations" value={formatNumber(kpis.cancellations.current)} />
        </View>
      ) : null}

      {occupancy && occupancy.rows.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Occupancy by day</Text>
          {occupancy.rows.map((row) => (
            <View key={row.bucket} style={styles.barRow}>
              <Text style={styles.barLabel}>{row.bucket.slice(5)}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[styles.barFill, { width: `${(row.occupancy_pct / maxOccupancy) * 100}%` }]}
                />
              </View>
              <Text style={styles.barValue}>{row.occupancy_pct}%</Text>
            </View>
          ))}
        </View>
      ) : null}

      {revenuePerSpace && revenuePerSpace.rows.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Revenue per space</Text>
          {revenuePerSpace.rows.map((row) => (
            <View key={row.space_public_id} style={styles.listRow}>
              <Text style={styles.listTitle}>{row.space_name}</Text>
              <Text style={styles.mutedText}>
                {row.location_name} • {row.space_type.replace(/_/g, " ")}
              </Text>
              <Text style={styles.mutedText}>
                {row.bookings} bookings • {row.hours_booked}h • net {formatCents(row.owner_net)} •{" "}
                {formatCents(row.avg_revenue_per_hour)}/h
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {topMembers && topMembers.rows.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top members</Text>
          {topMembers.rows.map((row, index) => (
            <View key={row.user_public_id || row.email || String(index)} style={styles.listRow}>
              <Text style={styles.listTitle}>{row.name || row.email || "Member"}</Text>
              <Text style={styles.mutedText}>
                {row.bookings} bookings • {formatCents(row.spend)}
                {row.last_booking ? ` • last ${new Date(row.last_booking).toLocaleDateString()}` : ""}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {busiest.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Busiest hours</Text>
          {busiest.map((cell) => (
            <Text key={`${cell.day}-${cell.hour}`} style={styles.mutedText}>
              {DAY_LABEL[cell.day] || `Day ${cell.day}`} {String(cell.hour).padStart(2, "0")}:00 —{" "}
              {cell.count} bookings
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.mutedText}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub ? <Text style={styles.mutedText}>{sub}</Text> : null}
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
    marginTop: 4,
    fontSize: 14,
    color: "#6B7280"
  },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center"
  },
  rowInput: {
    flex: 1
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
  applyButton: {
    borderRadius: 10,
    backgroundColor: "#4F46E5",
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  applyButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700"
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  statCard: {
    flexGrow: 1,
    minWidth: 150,
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
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  barLabel: {
    width: 44,
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
    width: 44,
    textAlign: "right",
    fontSize: 11,
    color: "#374151",
    fontWeight: "700"
  },
  listRow: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    gap: 3
  },
  listTitle: {
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
  }
});
