import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Space = {
  public_id: string;
  name: string;
  space_type: string;
  capacity: number;
  price_daily?: number | string | null;
  price_monthly?: number | string | null;
  price_hourly?: number | string | null;
  availability_status: string;
  visibility?: string;
};

export function OwnerLocationRoomsScreen() {
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
    setMessage("");
    apiFetch<Space[]>(`/api/locations/${locationId}/spaces`, { method: "GET" }, token)
      .then((rows) => setSpaces(Array.isArray(rows) ? rows : []))
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load rooms"))
      .finally(() => setLoading(false));
  }, [locationId, token]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Manage rooms</Text>
          <Text style={styles.subtitle}>{name || "Rooms and spaces"} available for this location.</Text>
        </View>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate("OwnerAddSpace", { locationId, locationName: name })}
          accessibilityRole="button"
          accessibilityLabel="Add space"
          disabled={!locationId}
        >
          <Text style={styles.primaryButtonText}>Add space</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.list}>
        {spaces.length === 0 && !loading ? (
          <Text style={styles.empty}>No rooms or desks have been added for this location.</Text>
        ) : (
          spaces.map((space) => (
            <View key={space.public_id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{space.name || titleize(space.space_type)}</Text>
                  <Text style={styles.cardSubtitle}>
                    {titleize(space.space_type)} - Capacity {space.capacity}
                  </Text>
                </View>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{titleize(space.availability_status)}</Text>
                </View>
              </View>
              <Text style={styles.cardMuted}>{rateSummary(space)}</Text>
              {space.visibility ? <Text style={styles.cardMuted}>Visibility: {titleize(space.visibility)}</Text> : null}
              <TouchableOpacity
                style={styles.editButton}
                onPress={() =>
                  navigation.navigate("OwnerSpaceEdit", {
                    spaceId: space.public_id,
                    name: space.name || titleize(space.space_type),
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Edit ${space.name || titleize(space.space_type)}`}
              >
                <Text style={styles.editButtonText}>Edit space</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function titleize(value: string | null | undefined) {
  return (value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMoney(value: number | string | null | undefined) {
  if (value == null || value === "") return "";
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return "";
  return `$${numberValue.toFixed(Number.isInteger(numberValue) ? 0 : 2)}`;
}

function rateSummary(space: Space) {
  const rates = [
    space.price_hourly != null ? `${formatMoney(space.price_hourly)}/hr` : "",
    space.price_daily != null ? `${formatMoney(space.price_daily)}/day` : "",
    space.price_monthly != null ? `${formatMoney(space.price_monthly)}/mo` : "",
  ].filter(Boolean);
  return rates.length > 0 ? rates.join(" - ") : "No price set";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB"
  },
  content: {
    padding: 20,
    gap: 14
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
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
  primaryButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#4F46E5"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700"
  },
  message: {
    color: "#DC2626",
    fontSize: 12
  },
  list: {
    gap: 12
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB"
  },
  cardHeader: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start"
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "#374151"
  },
  cardMuted: {
    marginTop: 6,
    fontSize: 12,
    color: "#6B7280"
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "#EEF2FF"
  },
  editButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF"
  },
  editButtonText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "700"
  },
  statusText: {
    color: "#3730A3",
    fontSize: 12,
    fontWeight: "700"
  },
  empty: {
    fontSize: 12,
    color: "#6B7280"
  }
});
