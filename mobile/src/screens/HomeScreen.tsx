import { useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";

type MarketplaceSpace = {
  space_public_id: string;
  space_type: string;
  capacity: number;
  price_daily: number | null;
  price_monthly: number | null;
  availability_status: string;
  availability_start_time?: string | null;
  availability_end_time?: string | null;
  location_public_id: string;
  location_name: string;
  location_address: string;
  location_city: string | null;
  image_url: string | null;
};

export function HomeScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const [city, setCity] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radiusKm, setRadiusKm] = useState("25");
  const [spaceType, setSpaceType] = useState("");
  const [minCapacity, setMinCapacity] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [spaces, setSpaces] = useState<MarketplaceSpace[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSearch() {
    if (!token) return;
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams();
      if (city.trim()) params.set("city", city.trim());
      if (lat.trim()) params.set("lat", lat.trim());
      if (lng.trim()) params.set("lng", lng.trim());
      if (radiusKm.trim()) params.set("radius_km", radiusKm.trim());
      if (spaceType.trim()) params.set("space_type", spaceType.trim());
      if (minCapacity.trim()) params.set("min_capacity", minCapacity.trim());
      if (maxPrice.trim()) params.set("max_price", maxPrice.trim());
      const query = params.toString();
      const path = query ? `/api/marketplace/search?${query}` : "/api/marketplace/search";
      const list = await apiFetch<MarketplaceSpace[]>(path, { method: "GET" }, token);
      setSpaces(list);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load locations");
      setSpaces([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Marketplace</Text>
      <Text style={styles.subtitle}>Search and discover spaces.</Text>
      <TextInput
        style={styles.input}
        placeholder="City (optional)"
        value={city}
        onChangeText={setCity}
      />
      <View style={styles.geoRow}>
        <TextInput
          style={[styles.input, styles.geoInput]}
          placeholder="Lat"
          value={lat}
          onChangeText={setLat}
        />
        <TextInput
          style={[styles.input, styles.geoInput]}
          placeholder="Lng"
          value={lng}
          onChangeText={setLng}
        />
        <TextInput
          style={[styles.input, styles.geoInput]}
          placeholder="Km"
          value={radiusKm}
          onChangeText={setRadiusKm}
        />
      </View>
      <View style={styles.geoRow}>
        <TextInput
          style={[styles.input, styles.geoInput]}
          placeholder="Type"
          value={spaceType}
          onChangeText={setSpaceType}
        />
        <TextInput
          style={[styles.input, styles.geoInput]}
          placeholder="Min cap"
          value={minCapacity}
          onChangeText={setMinCapacity}
        />
        <TextInput
          style={[styles.input, styles.geoInput]}
          placeholder="Max $"
          value={maxPrice}
          onChangeText={setMaxPrice}
        />
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={handleSearch} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Search</Text>}
      </TouchableOpacity>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.list}>
        {spaces.length === 0 && !loading ? (
          <Text style={styles.empty}>No spaces yet.</Text>
        ) : (
          spaces.map((space) => (
            <TouchableOpacity
              key={space.space_public_id}
              style={styles.card}
              onPress={() => navigation.navigate("SpaceDetail", { spaceId: space.space_public_id })}
            >
              {space.image_url ? (
                <Image source={{ uri: space.image_url }} style={styles.cardImage} />
              ) : null}
              <Text style={styles.cardTitle}>{space.space_type}</Text>
              <Text style={styles.cardSubtitle}>{space.location_name}</Text>
              <Text style={styles.cardMuted}>{space.location_address}</Text>
              {space.location_city ? <Text style={styles.cardMuted}>{space.location_city}</Text> : null}
              {space.availability_start_time || space.availability_end_time ? (
                <Text style={styles.cardMuted}>
                  Hours: {space.availability_start_time || "--:--"} to {space.availability_end_time || "--:--"}
                </Text>
              ) : null}
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
  input: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#FFFFFF"
  },
  geoRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8
  },
  geoInput: {
    flex: 1,
    marginTop: 0
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600"
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
  cardImage: {
    height: 140,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: "#F3F4F6"
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
