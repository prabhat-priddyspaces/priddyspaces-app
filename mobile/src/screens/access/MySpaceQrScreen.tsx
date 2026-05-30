import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";

import { useAuth } from "../../context/AuthContext";
import { AccessPass, listAccessPasses } from "../../lib/accessPasses";
import { AccessPassCard } from "./AccessPassesScreen";
import { accessStyles as styles } from "./accessStyles";

export function MySpaceQrScreen() {
  const { token } = useAuth();
  const [pass, setPass] = useState<AccessPass | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMessage("");
    try {
      const passes = await listAccessPasses(token);
      setPass(passes[0] ?? null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load QR pass");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      <Text style={styles.title}>My Space QR</Text>
      <Text style={styles.subtitle}>Focused QR for your next approved booking.</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {loading && !pass ? <ActivityIndicator style={{ marginTop: 18 }} /> : null}
      {pass ? (
        <AccessPassCard pass={pass} focused />
      ) : !loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No QR available</Text>
          <Text style={styles.muted}>Only valid approved bookings can produce usable QR codes.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
