import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { adminStyles as styles } from "./adminStyles";

type PlatformResp = {
  summary: {
    gmv: number;
    platform_earnings: number;
    take_rate_pct: number;
    failed_payments: number;
    new_members: number;
    new_owners: number;
  };
};

type OrgRow = {
  organization_public_id: string | null;
  organization_name: string;
  review_status: string | null;
  gmv: number;
  platform_earnings: number;
  owner_net: number;
  payments: number;
};

type CitiesResp = { rows: Array<{ city: string; bookings: number }> };

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function AdminAnalyticsScreen() {
  const { token } = useAuth();
  const [startDate, setStartDate] = useState(daysAgoIso(29));
  const [endDate, setEndDate] = useState(todayIso());
  const [platform, setPlatform] = useState<PlatformResp | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [cities, setCities] = useState<CitiesResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const range = useMemo(() => `start_date=${startDate}&end_date=${endDate}`, [startDate, endDate]);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setMessage("");
    Promise.all([
      apiFetch<PlatformResp>(`/api/analytics/admin/platform?${range}&granularity=day`, { method: "GET" }, token),
      apiFetch<{ rows: OrgRow[] }>(`/api/analytics/admin/org-leaderboard?${range}&limit=10`, { method: "GET" }, token).catch(() => ({ rows: [] })),
      apiFetch<CitiesResp>(`/api/analytics/admin/cities?${range}`, { method: "GET" }, token).catch(() => null),
    ])
      .then(([platformResp, orgResp, citiesResp]) => {
        setPlatform(platformResp);
        setOrgs(orgResp.rows);
        setCities(citiesResp);
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [token, range]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = platform?.summary;
  const stats: Array<[string, string]> = summary
    ? [
        ["GMV", currency.format(summary.gmv)],
        ["Platform earnings", currency.format(summary.platform_earnings)],
        ["Take rate", `${summary.take_rate_pct}%`],
        ["Failed payments", String(summary.failed_payments)],
        ["New members", String(summary.new_members)],
        ["New owners", String(summary.new_owners)],
      ]
    : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Platform analytics</Text>
      <Text style={styles.subtitle}>GMV, earnings, growth, and geography across all owners.</Text>

      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Start date"
          style={styles.input}
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#9CA3AF"
        />
        <TextInput
          accessibilityLabel="End date"
          style={styles.input}
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#9CA3AF"
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel="Apply range"
        >
          <Text style={styles.searchButtonText}>Apply</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {stats.map(([label, value]) => (
          <View key={label} style={[styles.card, { flexGrow: 1, minWidth: 130 }]}>
            <Text style={styles.mutedText}>{label}</Text>
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#111827" }}>{value}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Org leaderboard</Text>
      <View style={styles.list}>
        {orgs.map((org, index) => (
          <View key={org.organization_public_id || String(index)} style={styles.card}>
            <Text style={styles.cardTitle}>{org.organization_name}</Text>
            <Text style={styles.mutedText}>
              GMV {currency.format(org.gmv)} • earnings {currency.format(org.platform_earnings)} • net{" "}
              {currency.format(org.owner_net)} • {org.payments} payments
              {org.review_status ? ` • ${org.review_status}` : ""}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Top cities</Text>
      <View style={styles.list}>
        {(cities?.rows ?? []).map((row) => (
          <View key={row.city} style={styles.card}>
            <Text style={styles.cardTitle}>{row.city}</Text>
            <Text style={styles.mutedText}>{row.bookings} bookings</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
