import { useCallback, useEffect, useState } from "react";
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

type ListingRecord = {
  space_public_id: string;
  space_name: string;
  space_type: string;
  visibility: string;
  availability_status: string;
  location_name: string;
  organization_name: string;
  organization_review_status: string;
  bookings: number;
  booking_requests: number;
};

export function AdminListingsScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<ListingRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(
    async (search: string) => {
      if (!token) return;
      const q = search.trim();
      const path = q ? `/api/admin/listings?q=${encodeURIComponent(q)}` : "/api/admin/listings";
      const result = await apiFetch<ListingRecord[]>(path, { method: "GET" }, token);
      setRows(result);
    },
    [token],
  );

  useEffect(() => {
    setLoading(true);
    load("")
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load listings"))
      .finally(() => setLoading(false));
  }, [load]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Listings</Text>
      <Text style={styles.subtitle}>
        Track listing visibility and approval dependency across the marketplace.
      </Text>

      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Search listings"
          style={styles.input}
          placeholder="Search by space, location, or owner"
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={() => load(query).catch((err) => setMessage(err instanceof Error ? err.message : "Search failed"))}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.list}>
        {rows.length === 0 && !loading ? <Text style={styles.mutedText}>No listings.</Text> : null}
        {rows.map((row) => (
          <View key={row.space_public_id} style={styles.card}>
            <Text style={styles.cardTitle}>{row.space_name || row.space_type}</Text>
            <Text style={styles.mutedText}>
              {row.organization_name} / {row.location_name}
            </Text>
            <Text style={styles.mutedText}>
              {row.visibility} • {row.availability_status} • review {row.organization_review_status}
            </Text>
            <Text style={styles.mutedText}>
              {row.bookings} bookings • {row.booking_requests} requests
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
