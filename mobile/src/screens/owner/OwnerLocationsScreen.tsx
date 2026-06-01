import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type LocationStatusFilter = "all" | "active" | "inactive";

type Location = {
  public_id: string;
  organization_public_id?: string;
  name: string;
  address: string;
  city: string | null;
  state?: string | null;
  timezone: string;
  status: string;
};

type Space = {
  public_id: string;
};

type ApprovedBookingRequest = {
  public_id: string;
  location_public_id: string | null;
  end_datetime: string;
};

export function OwnerLocationsScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const [locations, setLocations] = useState<Location[]>([]);
  const [spaceCounts, setSpaceCounts] = useState<Record<string, number>>({});
  const [upcomingApprovedCounts, setUpcomingApprovedCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LocationStatusFilter>("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    const accessToken = token;
    let active = true;

    async function load() {
      setLoading(true);
      setMessage("");
      try {
        const [locationRows, approvedRows] = await Promise.all([
          apiFetch<Location[]>("/api/locations", { method: "GET" }, accessToken),
          apiFetch<ApprovedBookingRequest[]>("/api/booking-requests?status=approved", { method: "GET" }, accessToken).catch(
            () => [],
          ),
        ]);
        if (!active) return;
        const safeLocations = Array.isArray(locationRows) ? locationRows : [];
        setLocations(safeLocations);
        setUpcomingApprovedCounts(groupUpcomingApproved(Array.isArray(approvedRows) ? approvedRows : []));

        const countEntries = await Promise.all(
          safeLocations.map(async (loc) => {
            const spaces = await apiFetch<Space[]>(
              `/api/locations/${loc.public_id}/spaces`,
              { method: "GET" },
              accessToken,
            ).catch(() => []);
            return [loc.public_id, Array.isArray(spaces) ? spaces.length : 0] as const;
          }),
        );
        if (active) setSpaceCounts(Object.fromEntries(countEntries));
      } catch (err) {
        if (active) setMessage(err instanceof Error ? err.message : "Failed to load locations");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [token]);

  const cityOptions = useMemo(
    () => Array.from(new Set(locations.map((loc) => loc.city).filter(Boolean) as string[])).sort(),
    [locations],
  );

  const filteredLocations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return locations.filter((loc) => {
      const matchesQuery =
        !normalizedQuery ||
        loc.name.toLowerCase().includes(normalizedQuery) ||
        loc.address.toLowerCase().includes(normalizedQuery) ||
        (loc.city || "").toLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || loc.status === statusFilter;
      const matchesCity = cityFilter === "all" || loc.city === cityFilter;
      return matchesQuery && matchesStatus && matchesCity;
    });
  }, [cityFilter, locations, query, statusFilter]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Locations</Text>
          <Text style={styles.subtitle}>Manage locations and the rooms available at each site.</Text>
        </View>
        <TouchableOpacity
          style={styles.newButton}
          onPress={() => navigation.navigate("OwnerNewLocation")}
          accessibilityRole="button"
          accessibilityLabel="New location"
        >
          <Text style={styles.newButtonText}>New location</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        value={query}
        onChangeText={setQuery}
        placeholder="Search location, city, address"
        accessibilityLabel="Search locations"
      />

      <View style={styles.filterGroup}>
        <Text style={styles.filterLabel}>Status</Text>
        <View style={styles.filterRow}>
          <FilterChip
            label="All"
            active={statusFilter === "all"}
            onPress={() => setStatusFilter("all")}
            accessibilityLabel="Filter status all"
          />
          <FilterChip
            label="Active"
            active={statusFilter === "active"}
            onPress={() => setStatusFilter("active")}
            accessibilityLabel="Filter status active"
          />
          <FilterChip
            label="Inactive"
            active={statusFilter === "inactive"}
            onPress={() => setStatusFilter("inactive")}
            accessibilityLabel="Filter status inactive"
          />
        </View>
      </View>

      {cityOptions.length > 0 ? (
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>City</Text>
          <View style={styles.filterRow}>
            <FilterChip
              label="All"
              active={cityFilter === "all"}
              onPress={() => setCityFilter("all")}
              accessibilityLabel="Filter city all"
            />
            {cityOptions.map((city) => (
              <FilterChip
                key={city}
                label={city}
                active={cityFilter === city}
                onPress={() => setCityFilter(city)}
                accessibilityLabel={`Filter city ${city}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.list}>
        {filteredLocations.length === 0 && !loading ? (
          <Text style={styles.empty}>
            {locations.length === 0 ? "No owner locations configured yet." : "No owner locations match these filters."}
          </Text>
        ) : (
          filteredLocations.map((loc) => (
            <View key={loc.public_id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{loc.name}</Text>
                  <Text style={styles.cardSubtitle}>{loc.address}</Text>
                  {loc.city ? <Text style={styles.cardMuted}>{loc.city}</Text> : null}
                </View>
                <View style={[styles.statusPill, loc.status === "inactive" && styles.statusPillInactive]}>
                  <View style={[styles.statusDot, loc.status === "inactive" && styles.statusDotInactive]} />
                  <Text style={[styles.statusText, loc.status === "inactive" && styles.statusTextInactive]}>
                    {statusLabel(loc.status)}
                  </Text>
                </View>
              </View>

              <View style={styles.metricRow}>
                <Metric label="Rooms" value={(spaceCounts[loc.public_id] ?? 0).toString()} />
                <Metric label="Upcoming approved" value={(upcomingApprovedCounts[loc.public_id] ?? 0).toString()} />
                <Metric label="MTD net" value="--" />
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.primaryAction]}
                  onPress={() => navigation.navigate("OwnerLocationRooms", { locationId: loc.public_id, name: loc.name })}
                  accessibilityRole="button"
                  accessibilityLabel={`Manage rooms for ${loc.name}`}
                >
                  <Text style={styles.primaryActionText}>Manage rooms</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => navigation.navigate("OwnerLocationEdit", { locationId: loc.public_id })}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${loc.name}`}
                >
                  <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() =>
                    navigation.navigate("OwnerAddSpace", { locationId: loc.public_id, locationName: loc.name })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Add space for ${loc.name}`}
                >
                  <Text style={styles.actionText}>Add space</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function groupUpcomingApproved(requests: ApprovedBookingRequest[]) {
  const now = Date.now();
  return requests.reduce<Record<string, number>>((counts, request) => {
    if (!request.location_public_id) return counts;
    const endTime = new Date(request.end_datetime).getTime();
    if (!Number.isFinite(endTime) || endTime < now) return counts;
    counts[request.location_public_id] = (counts[request.location_public_id] ?? 0) + 1;
    return counts;
  }, {});
}

function statusLabel(status: string) {
  if (status === "active") return "Active";
  if (status === "inactive") return "Inactive";
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";
}

function FilterChip({
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
      style={[styles.filterChip, active && styles.filterChipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
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
  newButton: {
    borderWidth: 1,
    borderColor: "#4F46E5",
    backgroundColor: "#4F46E5",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  newButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700"
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF"
  },
  filterGroup: {
    gap: 8
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4B5563"
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  filterChip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF"
  },
  filterChipActive: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF"
  },
  filterChipText: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "700"
  },
  filterChipTextActive: {
    color: "#3730A3"
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
    borderColor: "#E5E7EB",
    gap: 12
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10
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
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280"
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "#ECFDF5"
  },
  statusPillInactive: {
    backgroundColor: "#F3F4F6"
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#059669"
  },
  statusDotInactive: {
    backgroundColor: "#6B7280"
  },
  statusText: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "700"
  },
  statusTextInactive: {
    color: "#4B5563"
  },
  metricRow: {
    flexDirection: "row",
    gap: 6,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    padding: 10
  },
  metric: {
    flex: 1,
    minHeight: 46
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase"
  },
  metricValue: {
    marginTop: 5,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827"
  },
  actionRow: {
    flexDirection: "row",
    gap: 6
  },
  actionButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  primaryAction: {
    backgroundColor: "#4F46E5",
    borderColor: "#4F46E5"
  },
  actionText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center"
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center"
  },
  empty: {
    fontSize: 12,
    color: "#6B7280"
  }
});
