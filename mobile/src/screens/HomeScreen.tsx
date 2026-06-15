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
import { colors, fontSizes, radii, shadows } from "../theme";

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
        placeholderTextColor={colors.text4}
        accessibilityLabel="Search query"
        value={q}
        onChangeText={setQ}
      />
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder="Date YYYY-MM-DD"
          placeholderTextColor={colors.text4}
          accessibilityLabel="Date"
          value={date}
          onChangeText={setDate}
        />
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder="Start HH:MM"
          placeholderTextColor={colors.text4}
          accessibilityLabel="Start time"
          value={startTime}
          onChangeText={setStartTime}
        />
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder="End HH:MM"
          placeholderTextColor={colors.text4}
          accessibilityLabel="End time"
          value={endTime}
          onChangeText={setEndTime}
        />
      </View>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder="Capacity"
          placeholderTextColor={colors.text4}
          accessibilityLabel="Capacity"
          keyboardType="number-pad"
          value={capacity}
          onChangeText={setCapacity}
        />
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder={priceLabel}
          placeholderTextColor={colors.text4}
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
          placeholderTextColor={colors.text4}
          accessibilityLabel="Latitude"
          value={lat}
          onChangeText={setLat}
        />
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder="Longitude"
          placeholderTextColor={colors.text4}
          accessibilityLabel="Longitude"
          value={lng}
          onChangeText={setLng}
        />
        <TextInput
          style={[styles.input, styles.rowInput]}
          placeholder="Radius mi"
          placeholderTextColor={colors.text4}
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
        {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Search</Text>}
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
    flex: 1,
    backgroundColor: colors.bg
  },
  container: {
    padding: 24
  },
  title: {
    fontSize: fontSizes.pageTitle,
    fontWeight: "600",
    color: colors.text
  },
  subtitle: {
    marginTop: 6,
    fontSize: fontSizes.body,
    color: colors.text2
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface
  },
  chipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft
  },
  chipText: {
    color: colors.text2,
    fontSize: fontSizes.caption,
    fontWeight: "700"
  },
  chipTextActive: {
    color: colors.brandStrong
  },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSizes.body,
    color: colors.text,
    backgroundColor: colors.surface
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
    backgroundColor: colors.brand,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: "center"
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: "600",
    fontSize: fontSizes.body
  },
  message: {
    marginTop: 12,
    color: colors.danger,
    fontSize: fontSizes.caption
  },
  list: {
    marginTop: 16,
    gap: 12
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card
  },
  cardImage: {
    height: 140,
    borderRadius: radii.md,
    marginBottom: 12,
    backgroundColor: colors.surface2
  },
  cardTitle: {
    fontSize: fontSizes.cardTitle,
    fontWeight: "600",
    color: colors.text
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: fontSizes.small,
    color: colors.text2
  },
  cardMuted: {
    marginTop: 4,
    fontSize: fontSizes.caption,
    color: colors.text3
  },
  empty: {
    fontSize: fontSizes.caption,
    color: colors.text3
  }
});
