import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Space = {
  public_id: string;
  space_type: string;
  capacity: number;
  price_daily?: number | null;
  price_monthly?: number | null;
  availability_status: string;
};

export function LocationSpacesScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { locationId, name } = route.params || {};
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token || !locationId) return;
    setLoading(true);
    apiFetch<Space[]>(`/api/locations/${locationId}/spaces`, { method: "GET" }, token)
      .then(setSpaces)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load spaces"))
      .finally(() => setLoading(false));
  }, [token, locationId]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{name || "Spaces"}</Text>
      <Text style={styles.subtitle}>Choose a space to request booking.</Text>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.list}>
        {spaces.length === 0 && !loading ? (
          <Text style={styles.empty}>No spaces yet.</Text>
        ) : (
          spaces.map((space) => (
            <TouchableOpacity
              key={space.public_id}
              style={styles.card}
              onPress={() => navigation.navigate("SpaceDetail", { spaceId: space.public_id })}
            >
              <Text style={styles.cardTitle}>{space.space_type}</Text>
              <Text style={styles.cardSubtitle}>Capacity {space.capacity}</Text>
              <Text style={styles.cardMuted}>{space.availability_status}</Text>
            </TouchableOpacity>
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
    fontSize: 16,
    fontWeight: "600",
    color: "#111827"
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 13,
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
