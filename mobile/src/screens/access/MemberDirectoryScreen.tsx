import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useAuth } from "../../context/AuthContext";
import { MemberDirectoryFilters, MemberDirectoryItem, listMemberDirectory } from "../../lib/accessPasses";
import { accessStyles as styles, titleize } from "./accessStyles";

type DirectoryLocationOption = Pick<MemberDirectoryItem, "location_public_id" | "location_name">;

function mergeDirectoryLocations(current: DirectoryLocationOption[], rows: MemberDirectoryItem[]): DirectoryLocationOption[] {
  const byId = new Map(current.map((location) => [location.location_public_id, location]));
  rows.forEach((row) => {
    if (!byId.has(row.location_public_id)) {
      byId.set(row.location_public_id, {
        location_public_id: row.location_public_id,
        location_name: row.location_name,
      });
    }
  });
  return Array.from(byId.values()).sort((a, b) => a.location_name.localeCompare(b.location_name));
}

function FilterChip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={[
        styles.secondaryButton,
        {
          marginRight: 8,
          marginTop: 8,
          backgroundColor: selected ? "#EEF2FF" : "#FFFFFF",
          borderColor: selected ? "#4F46E5" : "#E5E7EB",
        },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.secondaryButtonText, { color: selected ? "#3730A3" : "#111827" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function MemberDirectoryScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<MemberDirectoryItem[]>([]);
  const [locations, setLocations] = useState<DirectoryLocationOption[]>([]);
  const [filters, setFilters] = useState<MemberDirectoryFilters>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await listMemberDirectory(filters, token);
      setRows(data);
      setLocations((current) => mergeDirectoryLocations(current, data));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load directory");
    } finally {
      setLoading(false);
    }
  }, [filters, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasActiveFilters = Boolean(filters.location_public_id || filters.currently_in_office || filters.search?.trim());

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Member Directory</Text>
      <Text style={styles.subtitle}>Members recently or actively associated with your locations.</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={filters.search || ""}
          onChangeText={(value) => setFilters((current) => ({ ...current, search: value }))}
          placeholder="Search members"
          autoCapitalize="none"
          accessibilityLabel="Search members"
        />
        <Text style={styles.label}>Location</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <FilterChip
            label="All locations"
            selected={!filters.location_public_id}
            onPress={() => setFilters((current) => ({ ...current, location_public_id: "" }))}
            testID="mobile-directory-location-all"
          />
          {locations.map((location) => (
            <FilterChip
              key={location.location_public_id}
              label={location.location_name}
              selected={filters.location_public_id === location.location_public_id}
              onPress={() => setFilters((current) => ({ ...current, location_public_id: location.location_public_id }))}
              testID={`mobile-directory-location-${location.location_public_id}`}
            />
          ))}
        </ScrollView>
        <View style={[styles.row, { marginTop: 12 }]}>
          <Text style={styles.value}>In office now</Text>
          <Switch
            value={Boolean(filters.currently_in_office)}
            onValueChange={(value) => setFilters((current) => ({ ...current, currently_in_office: value }))}
            accessibilityLabel="In office now"
          />
        </View>
        <TouchableOpacity
          style={[styles.secondaryButton, { marginTop: 12, opacity: hasActiveFilters ? 1 : 0.5 }]}
          onPress={() => setFilters({})}
          disabled={!hasActiveFilters}
        >
          <Text style={styles.secondaryButtonText}>Clear filters</Text>
        </TouchableOpacity>
      </View>
      {loading && rows.length === 0 ? <ActivityIndicator style={{ marginTop: 18 }} /> : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => `${item.member_public_id}-${item.location_public_id}`}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={[styles.row, { justifyContent: "flex-start" }]}>
              {item.is_currently_in_office ? (
                <View
                  testID="mobile-member-presence-dot"
                  accessibilityLabel="Currently in office"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    backgroundColor: "#16A34A",
                  }}
                />
              ) : null}
              <Text style={styles.cardTitle}>{item.name || item.email}</Text>
            </View>
            <Text style={styles.muted}>{item.email}</Text>
            <Text style={styles.label}>Location</Text>
            <Text style={styles.value}>{item.location_name}</Text>
            <Text style={styles.label}>Space</Text>
            <Text style={styles.value}>{item.space_name || titleize(item.space_type)}</Text>
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{hasActiveFilters ? "No matching members" : "No members found"}</Text>
              <Text style={styles.muted}>
                {hasActiveFilters
                  ? "Try clearing filters or searching another shared location."
                  : "Directory entries appear when other members have active memberships or recent confirmed bookings at your locations."}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
