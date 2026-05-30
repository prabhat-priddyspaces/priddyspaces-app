import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useAuth } from "../../context/AuthContext";
import {
  AttendanceFilters,
  AttendanceLocation,
  AttendanceRecord,
  listAttendance,
  listAttendanceLocations,
  listCurrentAttendance,
} from "../../lib/accessPasses";
import { accessStyles as styles, formatDateTime, titleize } from "./accessStyles";

function AttendanceCard({ row }: { row: AttendanceRecord }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{row.member_name || row.member_email || "Member"}</Text>
      <Text style={styles.muted}>{row.member_email || "No email"}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{titleize(row.status)}</Text>
      </View>
      <Text style={styles.label}>Location</Text>
      <Text style={styles.value}>{row.location_name}</Text>
      <Text style={styles.label}>Space</Text>
      <Text style={styles.value}>{row.space_name || titleize(row.space_type)}</Text>
      <Text style={styles.label}>Window</Text>
      <Text style={styles.value}>{formatDateTime(row.start_datetime)} to {formatDateTime(row.end_datetime)}</Text>
      <Text style={styles.label}>Scanned by</Text>
      <Text style={styles.value}>{row.scanned_by_name || "Not scanned"}</Text>
    </View>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.secondaryButton,
        { marginRight: 8, marginTop: 8, backgroundColor: selected ? "#EEF2FF" : "#FFFFFF", borderColor: selected ? "#4F46E5" : "#E5E7EB" },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.secondaryButtonText, { color: selected ? "#3730A3" : "#111827" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const spaceTypes = [
  ["", "All types"],
  ["conference_room", "Conference"],
  ["private_office", "Private"],
  ["shared_desk", "Desk"],
  ["suite", "Suite"],
  ["virtual_office", "Virtual"],
] as const;

const statuses = [
  ["", "Any status"],
  ["checked_in", "Checked in"],
  ["checked_out", "Checked out"],
] as const;

export function AttendanceScreen() {
  const { token } = useAuth();
  const [filters, setFilters] = useState<AttendanceFilters>({ page: 1, page_size: 100 });
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [currentRows, setCurrentRows] = useState<AttendanceRecord[]>([]);
  const [locations, setLocations] = useState<AttendanceLocation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMessage("");
    try {
      const [result, current, locationOptions] = await Promise.all([
        listAttendance(filters, token),
        listCurrentAttendance(filters.location_public_id, token),
        listAttendanceLocations(token),
      ]);
      setRows(result.results);
      setCurrentRows(current);
      setLocations(locationOptions);
      setTotal(result.total);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [filters, token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance</Text>
      <Text style={styles.subtitle}>Office attendance and check-in history.</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Currently in office: {currentRows.length}</Text>
        {currentRows.length === 0 ? (
          <Text style={styles.muted}>No one is currently checked in.</Text>
        ) : (
          currentRows.slice(0, 3).map((row) => (
            <Text key={row.booking_public_id} style={styles.muted}>
              {row.member_name || row.member_email} · {row.location_name}
            </Text>
          ))
        )}
      </View>
      <View style={styles.card}>
        <Text style={styles.value}>Filtered records: {total}</Text>
        <Text style={styles.label}>Location</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <FilterChip
            label="All locations"
            selected={!filters.location_public_id}
            onPress={() => setFilters((current) => ({ ...current, location_public_id: "" }))}
          />
          {locations.map((location) => (
            <FilterChip
              key={location.location_public_id}
              label={location.location_name}
              selected={filters.location_public_id === location.location_public_id}
              onPress={() => setFilters((current) => ({ ...current, location_public_id: location.location_public_id }))}
            />
          ))}
        </ScrollView>
        <TextInput
          style={[styles.input, { marginTop: 10 }]}
          value={filters.date || ""}
          onChangeText={(value) => setFilters((current) => ({ ...current, date: value }))}
          placeholder="Date YYYY-MM-DD"
          autoCapitalize="none"
        />
        <Text style={styles.label}>Space type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {spaceTypes.map(([value, label]) => (
            <FilterChip
              key={value || "all"}
              label={label}
              selected={(filters.space_type || "") === value}
              onPress={() => setFilters((current) => ({ ...current, space_type: value }))}
            />
          ))}
        </ScrollView>
        <Text style={styles.label}>Status</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {statuses.map(([value, label]) => (
            <FilterChip
              key={value || "all"}
              label={label}
              selected={(filters.status || "") === value}
              onPress={() => setFilters((current) => ({ ...current, status: value }))}
            />
          ))}
        </ScrollView>
        <TextInput
          style={[styles.input, { marginTop: 10 }]}
          value={filters.search || ""}
          onChangeText={(value) => setFilters((current) => ({ ...current, search: value }))}
          placeholder="Member name or email"
          autoCapitalize="none"
        />
        <View style={[styles.row, { marginTop: 12 }]}>
          <Text style={styles.value}>Currently in office</Text>
          <Switch
            value={Boolean(filters.currently_in_office)}
            onValueChange={(value) => setFilters((current) => ({ ...current, currently_in_office: value }))}
          />
        </View>
        <TouchableOpacity style={[styles.secondaryButton, { marginTop: 12 }]} onPress={load}>
          <Text style={styles.secondaryButtonText}>Apply filters</Text>
        </TouchableOpacity>
      </View>
      {loading && rows.length === 0 ? <ActivityIndicator style={{ marginTop: 18 }} /> : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => `${item.booking_public_id}-${item.status}`}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        renderItem={({ item }) => <AttendanceCard row={item} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No attendance records</Text>
              <Text style={styles.muted}>Check-ins and check-outs appear here after scans.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
