import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";

type MoneyAmount = number | string | null;

type MarketplaceLocation = {
  location_public_id: string;
  name: string;
  address: string;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  featured_image_url: string | null;
  location_amenities: string[];
  matching_space_count: number;
  starting_day_pass_price: MoneyAmount;
  starting_monthly_price: MoneyAmount;
  starting_hourly_price: MoneyAmount;
  starting_membership_price: number | null;
  distance_miles: number | null;
};

type MarketplaceLocationSearchResponse = {
  meta: { total_results?: number };
  results: MarketplaceLocation[];
};

// Mirrors PUBLIC_MARKETPLACE_CONFIGS in webUI/lib/public-marketplace.ts.
const CATEGORIES = [
  { value: "coworking", label: "Coworking", priceLabel: "Max day-pass price" },
  { value: "private_office", label: "Private offices", priceLabel: "Max monthly price" },
  { value: "meeting_room", label: "Meeting rooms", priceLabel: "Max room price" },
] as const;

const SORTS = [
  { value: "", label: "Default" },
  { value: "relevance", label: "Relevance" },
  { value: "distance", label: "Distance" },
  { value: "price_asc", label: "Lowest price" },
  { value: "price_desc", label: "Highest price" },
  { value: "name", label: "Name" },
] as const;

function formatPrice(value: MoneyAmount): string | null {
  if (value == null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return null;
  return `$${amount.toFixed(2).replace(/\.00$/, "")}`;
}

export function HomeScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["value"]>("coworking");
  const [q, setQ] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [capacity, setCapacity] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radiusMiles, setRadiusMiles] = useState("25");
  const [locations, setLocations] = useState<MarketplaceLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const search = useCallback(
    async (activeCategory: string) => {
      setLoading(true);
      setMessage("");
      try {
        // Same param-building rules as web's buildApiSearchParams: with a
        // lat/lng the radius does the location filtering and q is dropped.
        const params = new URLSearchParams();
        params.set("category", activeCategory);
        if (date.trim()) params.set("date", date.trim());
        if (startTime.trim()) params.set("start_time", startTime.trim());
        if (endTime.trim()) params.set("end_time", endTime.trim());
        if (capacity.trim()) params.set("capacity", capacity.trim());
        if (sort) params.set("sort", sort);
        if (maxPrice.trim()) params.set("max_price", maxPrice.trim());
        if (lat.trim() && lng.trim()) {
          params.set("lat", lat.trim());
          params.set("lng", lng.trim());
          if (radiusMiles.trim()) params.set("radius_miles", radiusMiles.trim());
        } else if (q.trim()) {
          params.set("q", q.trim());
        }
        const response = await apiFetch<MarketplaceLocationSearchResponse>(
          `/api/marketplace/locations?${params.toString()}`,
          { method: "GET" },
          token || undefined,
        );
        setLocations(response.results || []);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to load marketplace locations");
        setLocations([]);
      } finally {
        setLoading(false);
      }
    },
    [capacity, date, endTime, lat, lng, maxPrice, q, radiusMiles, sort, startTime, token],
  );

  useEffect(() => {
    void search(category);
    // Auto-load on mount and on category switch, like the web browser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, token]);

  const priceLabel = CATEGORIES.find((item) => item.value === category)?.priceLabel || "Max price";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Marketplace</Text>
      <Text style={styles.subtitle}>Browse coworking, private offices, and meeting rooms.</Text>

      <View style={styles.chipRow}>
        {CATEGORIES.map((item) => (
          <Chip
            key={item.value}
            label={item.label}
            active={category === item.value}
            accessibilityLabel={`Category ${item.label}`}
            onPress={() => setCategory(item.value)}
          />
        ))}
      </View>

      <TextInput
        style={styles.input}
        placeholder="Neighborhood, city, state, or ZIP"
        accessibilityLabel="Search query"
        value={q}
        onChangeText={setQ}
      />
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder="Date YYYY-MM-DD"
          accessibilityLabel="Date"
          value={date}
          onChangeText={setDate}
        />
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder="Start HH:MM"
          accessibilityLabel="Start time"
          value={startTime}
          onChangeText={setStartTime}
        />
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder="End HH:MM"
          accessibilityLabel="End time"
          value={endTime}
          onChangeText={setEndTime}
        />
      </View>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder="Capacity"
          accessibilityLabel="Capacity"
          keyboardType="number-pad"
          value={capacity}
          onChangeText={setCapacity}
        />
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder={priceLabel}
          accessibilityLabel="Max price"
          keyboardType="number-pad"
          value={maxPrice}
          onChangeText={setMaxPrice}
        />
      </View>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder="Latitude"
          accessibilityLabel="Latitude"
          value={lat}
          onChangeText={setLat}
        />
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder="Longitude"
          accessibilityLabel="Longitude"
          value={lng}
          onChangeText={setLng}
        />
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder="Radius mi"
          accessibilityLabel="Radius miles"
          value={radiusMiles}
          onChangeText={setRadiusMiles}
        />
      </View>
      <View style={styles.chipRow}>
        {SORTS.map((item) => (
          <Chip
            key={item.value || "default"}
            label={item.label}
            active={sort === item.value}
            accessibilityLabel={`Sort ${item.label}`}
            onPress={() => setSort(item.value)}
          />
        ))}
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => void search(category)}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Search locations"
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Search</Text>}
      </TouchableOpacity>
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.list}>
        {locations.length === 0 && !loading ? (
          <Text style={styles.empty}>No locations match these filters.</Text>
        ) : (
          locations.map((location) => {
            const dayPass = formatPrice(location.starting_day_pass_price);
            const monthly = formatPrice(location.starting_monthly_price);
            const hourly = formatPrice(location.starting_hourly_price);
            const prices = [
              dayPass ? `Day pass from ${dayPass}` : null,
              hourly ? `Hourly from ${hourly}` : null,
              monthly ? `Monthly from ${monthly}` : null,
            ].filter(Boolean);
            return (
              <TouchableOpacity
                key={location.location_public_id}
                style={styles.card}
                onPress={() =>
                  navigation.navigate("LocationSpaces", {
                    locationId: location.location_public_id,
                    name: location.name,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Open location ${location.name}`}
              >
                {location.featured_image_url ? (
                  <Image source={{ uri: location.featured_image_url }} style={styles.cardImage} />
                ) : null}
                <Text style={styles.cardTitle}>{location.name}</Text>
                <Text style={styles.cardSubtitle}>
                  {[location.address, location.city, location.state].filter(Boolean).join(", ")}
                </Text>
                <Text style={styles.cardMuted}>
                  {location.matching_space_count}{" "}
                  {location.matching_space_count === 1 ? "matching space" : "matching spaces"}
                  {location.distance_miles != null ? ` • ${location.distance_miles.toFixed(1)} mi` : ""}
                </Text>
                {prices.length > 0 ? <Text style={styles.cardMuted}>{prices.join(" • ")}</Text> : null}
                {location.location_amenities.length > 0 ? (
                  <Text style={styles.cardMuted} numberOfLines={1}>
                    {location.location_amenities.join(" • ")}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
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
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  chip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF"
  },
  chipActive: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF"
  },
  chipText: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "700"
  },
  chipTextActive: {
    color: "#3730A3"
  },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#FFFFFF"
  },
  row: {
    flexDirection: "row",
    gap: 8
  },
  rowInput: {
    flex: 1
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
