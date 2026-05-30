import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { useAuth } from "../../context/AuthContext";
import { AccessPass, listAccessPasses } from "../../lib/accessPasses";
import { accessStyles as styles, formatDateTime, titleize } from "./accessStyles";

export function AccessPassCard({ pass, focused = false }: { pass: AccessPass; focused?: boolean }) {
  return (
    <View style={[styles.card, focused ? { borderColor: "#4F46E5" } : null]}>
      <View style={{ alignItems: "center", marginBottom: 14 }} testID="mobile-access-pass-qr">
        <QRCode value={pass.qr_payload} size={focused ? 240 : 190} />
      </View>
      <Text style={styles.cardTitle}>{pass.space_name || titleize(pass.space_type)}</Text>
      <Text style={styles.muted}>{pass.location_name}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{titleize(pass.pass_status)}</Text>
      </View>
      <Text style={styles.label}>Booking</Text>
      <Text style={styles.value}>{pass.booking_public_id}</Text>
      <Text style={styles.label}>Space type</Text>
      <Text style={styles.value}>{titleize(pass.space_type)}</Text>
      <Text style={styles.label}>Start</Text>
      <Text style={styles.value}>{formatDateTime(pass.start_datetime)}</Text>
      <Text style={styles.label}>End</Text>
      <Text style={styles.value}>{formatDateTime(pass.end_datetime)}</Text>
    </View>
  );
}

export function AccessPassesScreen() {
  const { token } = useAuth();
  const [passes, setPasses] = useState<AccessPass[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMessage("");
    try {
      setPasses(await listAccessPasses(token));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load access passes");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Access Passes</Text>
      <Text style={styles.subtitle}>Secure QR passes for approved bookings.</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {loading && passes.length === 0 ? <ActivityIndicator style={{ marginTop: 18 }} /> : null}
      <FlatList
        data={passes}
        keyExtractor={(item) => item.public_id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        renderItem={({ item }) => <AccessPassCard pass={item} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No valid access passes</Text>
              <Text style={styles.muted}>Approved bookings will show a QR code here until the booking window expires.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
