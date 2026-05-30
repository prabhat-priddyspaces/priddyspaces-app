import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useAuth } from "../../context/AuthContext";
import { AttendanceFilters, AttendanceRecord, listAttendance } from "../../lib/accessPasses";
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

export function AttendanceScreen() {
  const { token } = useAuth();
  const [filters, setFilters] = useState<AttendanceFilters>({ page: 1, page_size: 100 });
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMessage("");
    try {
      const result = await listAttendance(filters, token);
      setRows(result.results);
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
        <Text style={styles.value}>Filtered records: {total}</Text>
        <TextInput
          style={[styles.input, { marginTop: 12 }]}
          value={filters.location_public_id || ""}
          onChangeText={(value) => setFilters((current) => ({ ...current, location_public_id: value }))}
          placeholder="Location public ID"
          autoCapitalize="none"
        />
        <TextInput
          style={[styles.input, { marginTop: 10 }]}
          value={filters.date || ""}
          onChangeText={(value) => setFilters((current) => ({ ...current, date: value }))}
          placeholder="Date YYYY-MM-DD"
          autoCapitalize="none"
        />
        <TextInput
          style={[styles.input, { marginTop: 10 }]}
          value={filters.space_type || ""}
          onChangeText={(value) => setFilters((current) => ({ ...current, space_type: value }))}
          placeholder="Space type"
          autoCapitalize="none"
        />
        <TextInput
          style={[styles.input, { marginTop: 10 }]}
          value={filters.status || ""}
          onChangeText={(value) => setFilters((current) => ({ ...current, status: value }))}
          placeholder="checked_in or checked_out"
          autoCapitalize="none"
        />
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
