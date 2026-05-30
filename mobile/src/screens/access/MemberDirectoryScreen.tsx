import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";

import { useAuth } from "../../context/AuthContext";
import { MemberDirectoryItem, listMemberDirectory } from "../../lib/accessPasses";
import { accessStyles as styles, titleize } from "./accessStyles";

export function MemberDirectoryScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<MemberDirectoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMessage("");
    try {
      setRows(await listMemberDirectory(token));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load directory");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Member Directory</Text>
      <Text style={styles.subtitle}>Members recently or actively associated with your locations.</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {loading && rows.length === 0 ? <ActivityIndicator style={{ marginTop: 18 }} /> : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => `${item.member_public_id}-${item.location_public_id}`}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.name || item.email}</Text>
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
              <Text style={styles.emptyTitle}>No members found</Text>
              <Text style={styles.muted}>Directory entries appear when other members have active memberships or recent confirmed bookings at your locations.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
