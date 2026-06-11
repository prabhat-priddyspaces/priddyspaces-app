import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type LocationDetail = {
  public_id: string;
  name: string;
  address: string;
  city: string | null;
};

type Space = {
  public_id: string;
  space_type: string;
  capacity: number;
  price_daily?: number | string | null;
  price_monthly?: number | string | null;
  availability_status: string;
  availability_start_time?: string | null;
  availability_end_time?: string | null;
};

function formatUsd(value: number | string | null | undefined, suffix: string) {
  if (value == null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return null;
  return `$${amount.toFixed(Number.isInteger(amount) ? 0 : 2)}${suffix}`;
}

export function LocationSpacesScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { locationId, name } = route.params || {};
  const [location, setLocation] = useState<LocationDetail | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token || !locationId) return;
    setLoading(true);
    Promise.all([
      apiFetch<LocationDetail>(`/api/locations/${locationId}`, { method: "GET" }, token).catch(() => null),
      apiFetch<Space[]>(`/api/locations/${locationId}/spaces`, { method: "GET" }, token),
    ])
      .then(([loc, rows]) => {
        setLocation(loc);
        setSpaces(rows);
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load spaces"))
      .finally(() => setLoading(false));
  }, [token, locationId]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>{location?.name || name || "Location spaces"}</Text>
      {location?.address ? (
        <Text style={styles.address}>
          {location.address}
          {location.city ? `, ${location.city}` : ""}
        </Text>
      ) : null}
      <Text style={styles.subtitle}>Choose a room or desk to request a booking.</Text>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.list}>
        {spaces.length === 0 && !loading ? (
          <Text style={styles.empty}>No bookable spaces available at this location.</Text>
        ) : (
          spaces.map((space) => {
            const prices = [
              formatUsd(space.price_daily, "/day"),
              formatUsd(space.price_monthly, "/mo"),
            ].filter(Boolean);
            return (
              <TouchableOpacity
                key={space.public_id}
                style={styles.card}
                onPress={() => navigation.navigate("SpaceDetail", { spaceId: space.public_id })}
              >
                <Text style={styles.cardTitle}>{space.space_type}</Text>
                <Text style={styles.cardSubtitle}>
                  Capacity {space.capacity} • {space.availability_status}
                </Text>
                {space.availability_start_time || space.availability_end_time ? (
                  <Text style={styles.cardMuted}>
                    Hours: {space.availability_start_time || "—"} to {space.availability_end_time || "—"}
                  </Text>
                ) : null}
                {prices.length > 0 ? <Text style={styles.cardMuted}>{prices.join(" • ")}</Text> : null}
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1
  },
  container: {
    padding: 24
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827"
  },
  address: {
    marginTop: 4,
    fontSize: 13,
    color: "#374151"
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
