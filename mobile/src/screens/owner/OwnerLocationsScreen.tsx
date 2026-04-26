import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Location = {
  public_id: string;
  name: string;
  address: string;
  city: string | null;
  timezone: string;
};

export function OwnerLocationsScreen() {
  const { token } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<Location[]>("/api/locations", { method: "GET" }, token)
      .then(setLocations)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load locations"))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Locations</Text>
      <Text style={styles.subtitle}>Manage locations and spaces.</Text>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.list}>
        {locations.length === 0 && !loading ? (
          <Text style={styles.empty}>No locations yet.</Text>
        ) : (
          locations.map((loc) => (
            <View key={loc.public_id} style={styles.card}>
              <Text style={styles.cardTitle}>{loc.name}</Text>
              <Text style={styles.cardSubtitle}>{loc.address}</Text>
              {loc.city ? <Text style={styles.cardMuted}>{loc.city}</Text> : null}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24
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
  empty: {
    fontSize: 12,
    color: "#6B7280"
  }
});
