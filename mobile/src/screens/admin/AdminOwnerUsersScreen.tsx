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

type OwnerUserRecord = {
  membership_public_id: string;
  user_public_id: string;
  email: string;
  name: string;
  organization_name: string;
  organization_review_status: string;
  role: string;
  assigned_locations: number;
};

export function AdminOwnerUsersScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<OwnerUserRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(
    async (search: string) => {
      if (!token) return;
      const q = search.trim();
      const path = q ? `/api/admin/owner-users?q=${encodeURIComponent(q)}` : "/api/admin/owner-users";
      const result = await apiFetch<OwnerUserRecord[]>(path, { method: "GET" }, token);
      setRows(result);
    },
    [token],
  );

  useEffect(() => {
    setLoading(true);
    load("")
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load owner users"))
      .finally(() => setLoading(false));
  }, [load]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Owner users</Text>
      <Text style={styles.subtitle}>Owner-side accounts and their organization roles.</Text>

      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Search owner users"
          style={styles.input}
          placeholder="Search by name, email, or organization"
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={() =>
            load(query).catch((err) => setMessage(err instanceof Error ? err.message : "Search failed"))
          }
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.list}>
        {rows.length === 0 && !loading ? <Text style={styles.mutedText}>No owner users.</Text> : null}
        {rows.map((row) => (
          <View key={row.membership_public_id} style={styles.card}>
            <Text style={styles.cardTitle}>{row.name || row.email}</Text>
            <Text style={styles.mutedText}>{row.email}</Text>
            <Text style={styles.mutedText}>
              {row.organization_name} • review {row.organization_review_status}
            </Text>
            <Text style={styles.mutedText}>
              {row.role} • {row.assigned_locations} locations
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
